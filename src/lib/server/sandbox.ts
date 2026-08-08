import { Sandbox, SandboxNotFoundError, SandboxFailedError, RailwayConnectionError } from 'railway';
import { createHash, randomBytes } from 'node:crypto';

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
 * A user's sandbox outlives their run so the next one skips the boot, and Railway's own idle
 * reaper ends it — the timer resets only on `exec`, never on traffic to this app, so an open
 * tab cannot hold a VM alive. Five minutes covers the pause between edit and re-run while
 * capping what an abandoned session can bill to a few minutes of one VM.
 *
 * This is deliberately not backed by a keep-alive ping. A ping loop would defeat the reaper
 * and turn an idle tab into an open-ended bill, which is the one failure mode worth designing
 * against here: memory x wall-clock is essentially the whole cost of a sandbox.
 */
const IDLE_MINUTES = 5;

/**
 * Bounds work in flight against Railway, not VM count: with a sandbox per user, what counts
 * against Hobby's 50-per-environment cap is how many people have been active inside the idle
 * window, which this cannot limit. Creation past the cap fails outright, so a site busy enough
 * to approach 50 concurrent users needs a shorter IDLE_MINUTES rather than a lower value here.
 */
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_RUNS ?? 16);

/** Where solutions are written and run; the template warms its caches here. */
export const WORKDIR = '/app';

/**
 * A sandbox command inherits *nothing* — not even PATH. Bash papers over it with a compiled-in
 * fallback, so `command -v g++` answers and the toolchain looks healthy right up until
 * something spawns a helper: g++ loses cc1plus, collect2 loses ld, rustc loses cc, all as
 * bare ENOENT. HOME is absent for the same reason, which would send every tool looking for
 * its cache somewhere other than where the template warmed it.
 *
 * Passed per-exec rather than as `env` at create time: create-time variables measured 2.4s
 * slower per sandbox, while per-command values ride inside the command string for free. That
 * is also why no credential may ever go in here — these values are readable from `ps` by the
 * very code the sandbox is running.
 */
const SANDBOX_ENV = {
	PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.cargo/bin:/root/.local/bin',
	HOME: '/root',
	UV_PYTHON_INSTALL_DIR: '/opt/uv/python',
	// Shared across a user's run directories so moving between problems doesn't rebuild every
	// dependency from scratch. Cargo locks the directory itself, so concurrent runs are safe.
	CARGO_TARGET_DIR: `${WORKDIR}/.cache/cargo-target`
};

/**
 * The names the SDK itself resolves a credential from, in its own precedence order: a project
 * token first, then an account token. Listing them here rather than checking one hard-coded
 * name keeps this preflight from rejecting a service the SDK would have authenticated fine.
 */
const TOKEN_VARS = ['RAILWAY_TOKEN', 'RAILWAY_API_TOKEN'];

/**
 * Checked per-run rather than at boot. When this lived in a dedicated runner service, missing
 * credentials meant that process had no purpose and exiting was right; here the same failure
 * would take down a site whose problem browsing, editor and saved solutions all work fine
 * without a sandbox. So running code fails loudly with a usable message and the rest serves.
 *
 * The message names the variables it wants because the failure it reports is almost always a
 * misnamed one, and a sandbox credential is invisible from the outside: nothing else on the
 * site degrades, so the only evidence is this string.
 */
function requireCredentials(): void {
	const missing: string[] = [];
	if (!TOKEN_VARS.some((k) => process.env[k])) missing.push(TOKEN_VARS.join(' or '));
	// Injected into every deployed service by Railway, so this is only ever unset locally.
	if (!process.env.RAILWAY_ENVIRONMENT_ID) missing.push('RAILWAY_ENVIRONMENT_ID');

	if (missing.length > 0) {
		throw new Error(
			`Code execution is unavailable: set ${missing.join(' and ')} on this service.`
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

export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * How much of a file may ride inside the command that runs it. `exec` sends the entire script
 * as one JSON WebSocket frame, and Railway's own guidance is to move files with the files API
 * and drive the sandbox with `exec` — problem 22, whose script carried the 46K name list,
 * proved the point by failing the exec outright rather than running.
 *
 * A solution is a few KB, so it keeps riding along with the command it is run by, and only
 * what is genuinely file-sized is uploaded separately.
 */
const MAX_INLINE_BYTES = 8 * 1024;

/**
 * Splits what a run needs on disk by how it gets there: small files into the command, anything
 * larger into its own upload.
 */
export function splitByTransport(files: Record<string, string>): {
	inline: Record<string, string>;
	upload: Record<string, string>;
} {
	const inline: Record<string, string> = {};
	const upload: Record<string, string> = {};

	for (const [name, content] of Object.entries(files)) {
		if (Buffer.byteLength(content) > MAX_INLINE_BYTES) upload[name] = content;
		else inline[name] = content;
	}

	return { inline, upload };
}

/**
 * What each sandbox already holds, by path and content, so a data file is uploaded once per VM
 * rather than once per run — problem 22's list does not change between attempts at it. Keyed by
 * the sandbox itself: a replaced VM is a different object and starts from nothing, which is
 * exactly right, since the replacement's disk really is empty.
 */
const uploaded = new WeakMap<Sandbox, Map<string, string>>();

/**
 * Puts `files` on the sandbox through the files API, which creates missing parents and retries
 * a dropped connection on its own. Recorded only once written, so a failed upload is retried by
 * the next run rather than assumed to have landed.
 */
async function uploadFiles(
	sandbox: Sandbox,
	directory: string,
	files: Record<string, string>
): Promise<void> {
	const entries = Object.entries(files);
	if (entries.length === 0) return;

	let present = uploaded.get(sandbox);
	if (!present) {
		present = new Map<string, string>();
		uploaded.set(sandbox, present);
	}

	for (const [name, content] of entries) {
		const path = `${WORKDIR}/${directory}/${name}`;
		const digest = createHash('sha256').update(content).digest('hex');
		if (present.get(path) === digest) continue;

		await sandbox.files.write(path, content);
		present.set(path, digest);
	}
}

/**
 * Emits shell that recreates `files` on disk, so a run needs one round trip to the sandbox
 * instead of two. `files.write` opens its own WebSocket to Railway's tcp-proxy, and setting
 * that connection up costs far more than shipping a few KB of source — which is why only the
 * files too big to carry (see `MAX_INLINE_BYTES`) pay for it.
 *
 * The heredoc delimiter is quoted, which stops the shell expanding anything in the body, and
 * randomised so no solution can end a heredoc early by containing the delimiter as a line.
 *
 * Files land byte-for-byte, trailing newline included — problem 22's `names.txt` ends mid-quote
 * with no newline at all, and a solution that split its contents and stripped the quotes would
 * carry a stray `\n` into the last name's score. Callers that want a trailing newline (every
 * generated source does) put one in the content.
 */
export function materialiseFiles(files: Record<string, string>): string {
	const parts: string[] = [];

	for (const [name, content] of Object.entries(files)) {
		const slash = name.lastIndexOf('/');
		if (slash !== -1) parts.push(`mkdir -p ${shellQuote(name.slice(0, slash))}`);

		const delimiter = `EULER_EOF_${randomBytes(8).toString('hex')}`;
		// A heredoc body always ends in a newline, so the one the content already carries is left
		// to the terminator, and content that carries none has the extra byte cut back off.
		const endsWithNewline = content.endsWith('\n');
		const body = endsWithNewline ? content.slice(0, -1) : content;

		parts.push(`cat > ${shellQuote(name)} <<'${delimiter}'\n${body}\n${delimiter}`);
		if (!endsWithNewline) parts.push(`truncate -s -1 ${shellQuote(name)}`);
	}

	return parts.join('\n');
}

/**
 * One live sandbox per user, keyed by their id so no two people ever share a VM. Holds the
 * promise rather than the sandbox so concurrent callers await one boot instead of racing to
 * create several, and so a warm-up started at page load is the very thing the first run waits
 * on. A rejected boot is evicted so the next attempt retries instead of caching the failure.
 */
const leases = new Map<string, Promise<Sandbox>>();

function lease(userId: string): Promise<Sandbox> {
	let pending = leases.get(userId);
	if (pending) return pending;

	pending = (async () => {
		const checkpoint = await ensureCheckpoint();
		return Sandbox.create(checkpoint, { region: REGION, idleTimeoutMinutes: IDLE_MINUTES });
	})().catch((err) => {
		if (leases.get(userId) === pending) leases.delete(userId);
		throw err;
	});

	leases.set(userId, pending);
	return pending;
}

/** Drops a lease so the next run boots a fresh VM, destroying the old one if it still exists. */
function evict(userId: string, sandbox?: Sandbox): void {
	cancelReaper(userId);
	leases.delete(userId);
	void sandbox?.destroy().catch(() => {});
}

/**
 * Releases a user's VM once it has gone unused for as long as Railway would have tolerated.
 *
 * Railway's reaper would take it anyway, but only this side knows it happened: without a local
 * expiry the lease keeps pointing at a destroyed VM, and the next run discovers that by having
 * an exec fail before it can boot a replacement. Expiring here means that run boots directly,
 * and billing stops the moment the VM stops being useful rather than whenever it is noticed.
 */
const reapers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelReaper(userId: string): void {
	const timer = reapers.get(userId);
	if (timer !== undefined) {
		clearTimeout(timer);
		reapers.delete(userId);
	}
}

function scheduleReaper(userId: string): void {
	cancelReaper(userId);

	const timer = setTimeout(() => {
		reapers.delete(userId);
		const pending = leases.get(userId);
		leases.delete(userId);
		void pending?.then((sandbox) => sandbox.destroy()).catch(() => {});
	}, IDLE_MINUTES * 60 * 1000);

	// Never hold the process open just to retire a sandbox that Railway also retires.
	(timer as { unref?: () => void }).unref?.();
	reapers.set(userId, timer);
}

/**
 * Starts a user's sandbox ahead of their first run, so opening a problem hides the boot behind
 * the time they spend reading it. Deliberately fire-and-forget: warming is an optimisation, and
 * a failure here must not block a page that renders fine without a sandbox — the run path
 * boots one itself if this never landed or Railway has since reaped it.
 */
const WARM_INTERVAL_MS = 30_000;
const lastWarmed = new Map<string, number>();

export function warmSandbox(userId: string): void {
	// A live lease makes this free, but a failing one does not: lease() drops itself on rejection
	// so every keystroke-driven call would start another doomed boot. Throttling bounds that to
	// one attempt per interval however fast the typing is.
	const now = Date.now();
	if (now - (lastWarmed.get(userId) ?? 0) < WARM_INTERVAL_MS) return;
	lastWarmed.set(userId, now);

	void lease(userId)
		.then(() => {
			// Only arm expiry if nothing is running; a run in flight arms it when it finishes.
			if (!inFlight.has(userId)) scheduleReaper(userId);
		})
		.catch((err) => console.error(`sandbox warm-up failed for ${userId}: ${err}`));
}

/**
 * Runs in flight per user. The reaper must not retire a VM out from under a run, and with runs
 * no longer serialised a finished one cannot assume it was the only one — so expiry is armed
 * when a user's last run ends, not merely when any run ends.
 */
const inFlight = new Map<string, number>();

function runStarted(userId: string): void {
	cancelReaper(userId);
	inFlight.set(userId, (inFlight.get(userId) ?? 0) + 1);
}

function runFinished(userId: string): void {
	const remaining = (inFlight.get(userId) ?? 1) - 1;
	if (remaining > 0) {
		inFlight.set(userId, remaining);
		return;
	}

	inFlight.delete(userId);
	// From the end of the run, mirroring Railway's own timer, which resets per exec.
	if (leases.has(userId)) scheduleReaper(userId);
}

/** True for the failures that mean "this VM is gone", as opposed to the solution misbehaving. */
function sandboxIsGone(err: unknown): boolean {
	return (
		err instanceof SandboxNotFoundError ||
		err instanceof SandboxFailedError ||
		err instanceof RailwayConnectionError
	);
}

/**
 * Materialises the solution's files into the user's sandbox and runs one command in it. Small
 * files travel in the command; a problem's data file is uploaded and left there for later runs.
 *
 * The sandbox is reused across that user's runs rather than created per submission. Booting one
 * measured 2.0-6.3s — Railway polls for RUNNING on a doubling schedule, so even a fast boot is
 * quantised upward — and paying that on every submission put a hello world at 10-15s end to end.
 * Reuse moves it off the request path entirely; the VM then expires on its own IDLE_MINUTES
 * after the last run.
 *
 * Each run gets its own directory under /app, named by the caller after the problem and
 * language, so switching problems cannot overwrite another's sources and two of a user's runs
 * can proceed at once. That isolation is for correctness only — a directory is no boundary
 * between people, which is what the per-user VM is for.
 *
 * A run directory is not wiped between runs: whatever the last solve built there is a cache for
 * the next one, and every command compiles before it runs, so no stale artifact can pass as
 * fresh output.
 */
export async function runInSandbox(
	userId: string,
	directory: string,
	files: Record<string, string>,
	command: string,
	timeoutSec: number
): Promise<SandboxRun> {
	const release = await acquire();
	runStarted(userId);
	try {
		return await attempt(userId, directory, files, command, timeoutSec, true);
	} finally {
		runFinished(userId);
		release();
	}
}

/**
 * Retires anything the previous run in this directory left behind before starting a new one.
 *
 * With a VM per submission a stray process died with the machine. Reused, a solution that
 * double-forks outlives the exec that started it and then competes for CPU with the next run.
 * Each run records a marker and kills the one before it, which is why the marker is written
 * after the kill rather than before.
 *
 * The marker is `$$`, the shell's own pid, rather than its real process group. That is the
 * point: if the agent gave this command its own group then `$$` is that group's id and the
 * kill lands exactly on the previous run's tree, and if it did not, `$$` names no group at all
 * and the kill does nothing. Reading the true pgid instead would be strictly worse — a command
 * sharing a group with the guest agent would take the agent down with it. Best-effort by
 * construction, and it fails towards leaving strays rather than towards breaking the sandbox.
 */
function reapStrays(): string {
	return [
		`if [ -f .euler.pgid ]; then kill -TERM -"$(cat .euler.pgid)" 2>/dev/null || true; fi`,
		`echo $$ > .euler.pgid`
	].join('\n');
}

/**
 * The whole script a run sends: enter the run's directory, retire the previous run's strays,
 * write the sources, then hand over to the language's own command.
 *
 * cwd stays /app because exec fails outright on a missing directory and a problem's directory
 * may not exist yet; creating it here costs nothing over a round trip to check.
 */
export function buildScript(
	directory: string,
	files: Record<string, string>,
	command: string
): string {
	return [
		`mkdir -p ${shellQuote(directory)}`,
		`cd ${shellQuote(directory)}`,
		reapStrays(),
		materialiseFiles(files),
		command
	]
		.filter(Boolean)
		.join('\n');
}

async function attempt(
	userId: string,
	directory: string,
	files: Record<string, string>,
	command: string,
	timeoutSec: number,
	mayRetry: boolean
): Promise<SandboxRun> {
	const startedAt = performance.now();
	const sandbox = await lease(userId);
	const leasedAt = performance.now();

	try {
		const { inline, upload } = splitByTransport(files);

		// Inside the try so an upload that discovers a dead VM retries on a fresh one, exactly as
		// an exec does. Bounded generously: this is a file transfer, not the solution running.
		await withDeadline(uploadFiles(sandbox, directory, upload), 60_000, 'sandbox file upload');
		const uploadedAt = performance.now();

		const script = buildScript(directory, inline, command);

		// Budget: the command's own allowance plus room for connection setup.
		const result = await withDeadline(
			sandbox.exec(script, { cwd: WORKDIR, timeoutSec, env: SANDBOX_ENV }),
			(timeoutSec + 30) * 1000,
			'sandbox run'
		);
		const executedAt = performance.now();

		// A warm lease should read ~0ms, and upload only the first run that needs a data file, so
		// this says plainly whether reuse is working on both.
		console.log(
			`sandbox run: lease=${Math.round(leasedAt - startedAt)}ms ` +
				`upload=${Math.round(uploadedAt - leasedAt)}ms ` +
				`exec=${Math.round(executedAt - uploadedAt)}ms ` +
				`total=${Math.round(executedAt - startedAt)}ms`
		);

		return { stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut };
	} catch (err) {
		// exec resolves with exitCode for a solution that fails, so a throw is the infrastructure,
		// not the user's code — retrying re-runs nothing that already ran. Reuse makes this the
		// expected path, not an edge case: Railway reaps an idle VM silently, so the first run
		// after a pause inevitably meets a lease pointing at something that no longer exists.
		if (mayRetry && sandboxIsGone(err)) {
			console.log(`sandbox gone for ${userId}, booting a replacement: ${err}`);
			evict(userId, sandbox);
			return attempt(userId, directory, files, command, timeoutSec, false);
		}

		// A run that died for any other reason may have left the VM unusable; a fresh one costs
		// a boot, while keeping a broken lease would break every later run for this user.
		evict(userId, sandbox);
		throw err;
	}
}
