import { Sandbox } from 'railway';
import { createHash } from 'node:crypto';

/**
 * Solutions run in a Railway Sandbox — a per-submission VM — rather than in this container.
 *
 * The runner used to try gVisor, but rootless runsc needs to clone itself into a new user
 * namespace and Railway service containers are non-privileged, so it never came up and every
 * solution ran behind nothing but an rlimit. A sandbox is a stronger boundary than gVisor
 * would have been: solution code gets its own kernel, and an ISOLATED sandbox cannot reach
 * this environment's private network, so the app and Postgres are unreachable from it.
 *
 * It is not an egress boundary. Sandboxes have outbound internet in both network modes, which
 * is what lets dependency installs work inside the sandbox instead of needing a separate
 * network-enabled phase outside it.
 */

/** Sandboxes default to us-west2 regardless of account preference; these services are east. */
const REGION = process.env.SANDBOX_REGION ?? 'us-east4-eqdc4a';

/**
 * Sandboxes bill while they run, idle included. Everything here is destroyed in a `finally`,
 * so this only matters when the runner dies mid-request — one minute caps that leak.
 */
const IDLE_MINUTES = 1;

/**
 * Hobby allows 50 sandboxes per environment and creation past the cap fails outright, so
 * concurrent runs are capped well under it to leave headroom for a second replica.
 */
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_RUNS ?? 16);

/**
 * A sandbox command inherits *nothing* — not even PATH. Bash papers over it with a compiled-in
 * fallback, so `command -v g++` answers and the toolchain looks healthy right up until
 * something spawns a helper: g++ loses cc1plus, collect2 loses ld, rustc loses cc, all as
 * bare ENOENT. HOME is absent for the same reason, which would send every tool looking for
 * its cache somewhere other than where the template warmed it.
 *
 * Passed per-exec rather than as `env` at create time: create-time variables measured 2.4s
 * slower per sandbox, while per-command values ride inside the command string for free.
 */
const SANDBOX_ENV = {
	PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.cargo/bin:/root/.local/bin',
	HOME: '/root',
	UV_PYTHON_INSTALL_DIR: '/opt/uv/python'
};

/** Where solutions are written and run; the template warms its caches here. */
export const WORKDIR = '/app';

/**
 * Checked per-run rather than at boot. When this lived in a dedicated runner service, missing
 * credentials meant that process had no purpose and exiting was right; here the same failure
 * would take down a site whose problem browsing, editor and saved solutions all work fine
 * without a sandbox. So running code fails loudly with a usable message and the rest serves.
 */
function requireCredentials(): void {
	const missing = ['RAILWAY_API_TOKEN', 'RAILWAY_ENVIRONMENT_ID'].filter((k) => !process.env[k]);
	if (missing.length > 0) {
		throw new Error(
			`Code execution is unavailable: ${missing.join(' and ')} not set on this service.`
		);
	}
}

/**
 * The toolchains, formerly runner/Dockerfile's job. Built once by Railway, content-addressed
 * and cached, then snapshotted into a checkpoint that every submission boots from.
 */
function toolchainTemplate() {
	return (
		Sandbox.template()
			.withPackages(
				'curl',
				'ca-certificates',
				'gnupg',
				// bun's installer unpacks a zip; without this it fails in a way that reads as a
				// network error.
				'unzip',
				'build-essential',
				'binutils',
				'openjdk-21-jdk-headless'
			)
			// C++26. The Dockerfile reached GCC 16 through an Ubuntu-only PPA that has no Debian
			// equivalent; g++-15 is a plain package on this base and covers the standard. Installed
			// with an explicit step because routing it through withPackages failed in testing.
			.run('apt-get update && apt-get install -y g++-15 && rm -rf /var/lib/apt/lists/*')
			.withEnv({ UV_PYTHON_INSTALL_DIR: '/opt/uv/python' })
			.run('curl -fsSL https://astral.sh/uv/install.sh | sh')
			.run('/root/.local/bin/uv python install 3.13')
			.run('curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash')
			.run(
				'curl --proto "=https" --tlsv1.2 -fsSL https://sh.rustup.rs | ' +
					'sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable'
			)
			.run(
				'curl -fsSL https://github.com/clojure/brew-install/releases/latest/download/linux-install.sh ' +
					'-o /tmp/clj.sh && chmod +x /tmp/clj.sh && /tmp/clj.sh && rm /tmp/clj.sh'
			)
			// withEnv applies to build steps only and is not baked into sandboxes, so anything
			// depending on it at runtime must instead live at a fixed path. Without these,
			// `uv run` re-downloads the interpreter on every submission (~23s) and rustc is
			// simply absent.
			.run('ln -sf "$(/root/.local/bin/uv python find 3.13)" /usr/local/bin/python3.13')
			.run('ln -sf /root/.cargo/bin/rustc /usr/local/bin/rustc')
			.run('ln -sf /root/.cargo/bin/cargo /usr/local/bin/cargo')
			// Warm caches in WORKDIR itself: Clojure writes .cpcache relative to cwd, so warming
			// it anywhere else leaves every first solve paying to rebuild the classpath.
			.run(`mkdir -p ${WORKDIR}`)
			.workdir(WORKDIR)
			.run('echo "(println 1)" > w.clj && echo "{:deps {}}" > deps.edn && clojure -M w.clj')
			.run('echo "console.log(1)" > w.ts && bun run w.ts')
			.run('rm -f w.clj w.ts deps.edn')
	);
}

/**
 * Names the checkpoint after a hash of the template's own instructions, so editing a toolchain
 * yields a new name and the next boot rebuilds instead of quietly serving the old snapshot.
 * Railway hashes templates server-side but does not hand that id back, hence hashing here.
 */
function checkpointName(template: ReturnType<typeof toolchainTemplate>): string {
	const digest = createHash('sha256').update(JSON.stringify(template.compile())).digest('hex');
	return `euler-runner-${digest.slice(0, 16)}`;
}

let checkpointPromise: Promise<string> | null = null;

/**
 * Resolves to a checkpoint every run can boot from, building it if this template has not been
 * snapshotted yet. Memoised rather than guarded by a lock: concurrent callers share one build,
 * and a second replica racing this one is harmless since capture is idempotent by name.
 */
export function ensureCheckpoint(): Promise<string> {
	checkpointPromise ??= (async () => {
		requireCredentials();
		const template = toolchainTemplate();
		const name = checkpointName(template);

		const existing = await Sandbox.checkpoints();
		if (existing.some((c) => c.key === name)) {
			console.log(`sandbox checkpoint ready: ${name} (cached)`);
			return name;
		}

		console.log(`building sandbox checkpoint ${name}…`);
		const base = await Sandbox.create(template, { region: REGION, idleTimeoutMinutes: IDLE_MINUTES });
		try {
			await base.checkpoint(name);
		} finally {
			await base.destroy().catch(() => {});
		}

		// Superseded snapshots still count against the plan's checkpoint cap.
		for (const c of existing) {
			if (c.key.startsWith('euler-runner-') && c.key !== name) {
				await Sandbox.deleteCheckpoint(c.key).catch(() => {});
			}
		}

		console.log(`sandbox checkpoint ready: ${name}`);
		return name;
	})().catch((err) => {
		// Don't cache a failure: a transient build error would otherwise poison every later run.
		checkpointPromise = null;
		throw err;
	});

	return checkpointPromise;
}

let active = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<() => void> {
	if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
	active++;
	return () => {
		active--;
		waiting.shift()?.();
	};
}

export type SandboxRun = { stdout: string; stderr: string; timedOut: boolean };

/**
 * `timeoutSec` on exec only bounds the command once it is running inside the sandbox. Reaching
 * the sandbox at all is a WebSocket to Railway's tcp-proxy, and when that is unreachable the
 * call can hang indefinitely rather than failing — observed under Bun, where a blocked proxy
 * port produced no error at all while Node surfaced one immediately. Without an outer deadline
 * a single unreachable proxy pins a concurrency slot and leaves a VM billing until its idle
 * timeout.
 */
function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const expiry = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${what} exceeded ${Math.round(ms / 1000)}s`)), ms);
		// Don't hold the process open just to enforce a deadline that may never fire.
		timer.unref?.();
	});
	return Promise.race([work, expiry]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Boots a sandbox from the checkpoint, writes the solution's files, runs one command, and
 * destroys it. Restoring from a checkpoint measured ~1.7s against ~3.2s to fork a warm base,
 * and needs no base sandbox sitting there billing between submissions.
 */
export async function runInSandbox(
	files: Record<string, string>,
	command: string,
	timeoutSec: number
): Promise<SandboxRun> {
	const checkpoint = await ensureCheckpoint();
	const release = await acquire();

	const sandbox = await Sandbox.create(checkpoint, {
		region: REGION,
		idleTimeoutMinutes: IDLE_MINUTES
	});

	try {
		// Budget: the command's own allowance plus room for file upload and connection setup.
		const result = await withDeadline(
			(async () => {
				await Promise.all(
					Object.entries(files).map(([name, content]) =>
						sandbox.files.write(`${WORKDIR}/${name}`, content)
					)
				);
				return sandbox.exec(command, { cwd: WORKDIR, timeoutSec, env: SANDBOX_ENV });
			})(),
			(timeoutSec + 30) * 1000,
			'sandbox run'
		);

		return { stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut };
	} finally {
		// Never let teardown failure mask the run's own error, but do not leave a VM billing.
		await sandbox.destroy().catch((err) => console.error(`sandbox destroy failed: ${err}`));
		release();
	}
}
