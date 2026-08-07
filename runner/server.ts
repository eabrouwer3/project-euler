import http from 'http';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn, execFileSync } from 'child_process';
import { cargoToml, parsePackageSpec, validatePackages, type Language } from '@euler/shared';

const PORT = 3001;
const TIMEOUT_MS = 30_000;

/**
 * Tried in gVisor's own order of preference: systrap replaced ptrace as the default
 * platform in 2023 and ptrace survives only as a deprecated fallback. kvm is omitted
 * because it needs /dev/kvm, which no managed container host exposes.
 */
const SANDBOX_PLATFORMS = ['systrap', 'ptrace'];

/**
 * `--network` is a *global* runsc flag; the `do` subcommand has never accepted one of its
 * own. Passing it after `do` aborts with "flag provided but not defined: -network" before
 * a sandbox is ever started, which is subtle enough that it reads as "gVisor unavailable".
 */
function sandboxCommand(platform: string, cmd: string): string {
	return `runsc --rootless --network=none --platform=${platform} do -- sh -c ${JSON.stringify(cmd)}`;
}

/**
 * Rootless runsc has to `clone(CLONE_NEWUSER)` itself into a new user namespace, so it only
 * comes up on hosts that permit unprivileged user namespaces. A stock container seccomp
 * profile denies that clone outright, which is why the failure text matters more than the
 * boolean — without it the log cannot distinguish "runsc missing" from "host forbids it".
 */
function probeSandbox(): { platform: string } | { error: string } {
	const failures: string[] = [];

	for (const platform of SANDBOX_PLATFORMS) {
		try {
			execFileSync('sh', ['-c', sandboxCommand(platform, 'exit 0')], {
				stdio: ['ignore', 'ignore', 'pipe'],
				timeout: 15_000
			});
			return { platform };
		} catch (err) {
			const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim();
			failures.push(`${platform}: ${stderr || (err as Error).message}`);
		}
	}

	return { error: failures.join(' | ') };
}

const probe = probeSandbox();
const sandboxPlatform = 'platform' in probe ? probe.platform : null;

if ('platform' in probe) {
	console.log(`gVisor (runsc) sandbox enabled — platform=${probe.platform}`);
} else if (process.env.REQUIRE_SANDBOX === '1') {
	// Fail closed where the sandbox is meant to be load-bearing, rather than serving
	// untrusted code with nothing but an rlimit in front of it.
	console.error(`REQUIRE_SANDBOX=1 but gVisor is unavailable — ${probe.error}`);
	process.exit(1);
} else {
	console.warn(`gVisor unavailable, running with ulimit only — ${probe.error}`);
}

const server = http.createServer(async (req, res) => {
	if (req.method !== 'POST' || req.url !== '/run') {
		res.writeHead(404).end();
		return;
	}

	let body = '';
	for await (const chunk of req) body += chunk;

	const { language, code, packages } = JSON.parse(body) as {
		language: Language;
		code: string;
		packages: string[];
	};

	const dir = await mkdtemp(join(tmpdir(), 'euler-'));
	try {
		const result = await execCode(language, code, packages ?? [], dir);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(result));
	} catch (err) {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ stdout: '', stderr: String(err) }));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

server.listen(PORT, () => console.log(`Runner listening on :${PORT}`));

/**
 * A solution runs in two phases because the sandbox has no network. `fetch` resolves
 * dependencies with the network up but *outside* the sandbox, so it is restricted to
 * downloading — no wheel builds, no npm lifecycle scripts, no build.rs. Everything that
 * executes code the solution chose (including its dependencies') belongs in `run`.
 */
type Phases = { fetch?: string; run: string };

async function execCode(
	language: Language,
	code: string,
	packages: string[],
	dir: string
): Promise<{ stdout: string; stderr: string }> {
	validatePackages(language, packages);

	let phases: Phases;

	switch (language) {
		case 'python': {
			await writeFile(join(dir, 'main.py'), code);
			// An sdist would run its build backend during install, i.e. outside the sandbox;
			// wheels only keeps the fetch phase to unpacking archives.
			// --quiet keeps uv's progress chatter out of the solution's stderr without
			// hiding resolution failures, which the user does need to see.
			const install =
				packages.length > 0
					? ` && uv pip install --quiet --python .venv/bin/python --only-binary=:all: ${packages.join(' ')}`
					: '';
			phases = {
				fetch: `uv venv --quiet --python 3.13 .venv${install}`,
				run: '.venv/bin/python main.py'
			};
			break;
		}
		case 'typescript': {
			await writeFile(join(dir, 'main.ts'), code);
			const dependencies: Record<string, string> = {};
			for (const pkg of packages) {
				const { name, version = '*' } = parsePackageSpec(pkg);
				dependencies[name] = version;
			}
			await writeFile(
				join(dir, 'package.json'),
				JSON.stringify({ name: 'solution', private: true, dependencies }, null, 2)
			);
			phases = {
				fetch: packages.length > 0 ? 'bun install --no-progress --ignore-scripts' : undefined,
				run: 'bun run main.ts'
			};
			break;
		}
		case 'clojure': {
			await writeFile(join(dir, 'main.clj'), code);
			// A coordinate is `{:mvn/version "x"}` — one namespaced keyword, not a nested map.
			// JSON.stringify would emit `{"mvn":{"version":"x"}}`, whose quoted keys the edn
			// reader rejects outright ("Invalid token: :"), so it is spelled out here.
			const deps = packages
				.map((pkg) => {
					const [name, version = 'RELEASE'] = pkg.split('@');
					return `${name} {:mvn/version ${JSON.stringify(version)}}`;
				})
				.join(' ');
			await writeFile(join(dir, 'deps.edn'), `{:deps {${deps}}}`);
			// Unconditional: even a dependency-free solution resolves org.clojure/clojure itself,
			// and -P stops after populating ~/.m2 and .cpcache without running main.clj.
			phases = { fetch: 'clojure -P -M main.clj', run: 'clojure -M main.clj' };
			break;
		}
		case 'rust': {
			// Cargo only earns its build overhead when there are crates to resolve
			if (packages.length === 0) {
				await writeFile(join(dir, 'main.rs'), code);
				phases = { run: 'rustc -O --edition 2024 -o main main.rs && ./main' };
				break;
			}
			await mkdir(join(dir, 'src'), { recursive: true });
			await writeFile(join(dir, 'src', 'main.rs'), code);
			await writeFile(join(dir, 'Cargo.toml'), cargoToml(packages));
			// `fetch` downloads without building, so proc macros and build.rs stay sandboxed.
			phases = { fetch: 'cargo fetch --quiet', run: 'cargo run --quiet --release --offline' };
			break;
		}
		case 'cpp': {
			await writeFile(join(dir, 'main.cpp'), code);
			phases = { run: 'g++ -O2 -std=c++26 -o main main.cpp && ./main' };
			break;
		}
		case 'assembly': {
			await writeFile(join(dir, 'main.s'), code);
			phases = { run: 'as -o main.o main.s && ld -o main main.o && ./main' };
			break;
		}
	}

	return spawnWithTimeout(phases, dir);
}

function spawnWithTimeout(
	phases: Phases,
	cwd: string
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const sandboxedCmd = sandboxPlatform
			? sandboxCommand(sandboxPlatform, phases.run)
			: phases.run;

		// The fetch phase writes into `cwd` on the real filesystem; the sandbox mounts that
		// same tree read-only under a throwaway overlay, so the run phase sees what was
		// downloaded and its own writes never escape.
		const prefix = phases.fetch ? `${phases.fetch} && ` : '';
		const fullCmd = `ulimit -t 25; ${prefix}${sandboxedCmd}`;

		// Own process group: killing the shell alone would orphan whatever it had started,
		// and under gVisor that means a leaked sentry still holding the solution's memory.
		const proc = spawn('sh', ['-c', fullCmd], {
			cwd,
			env: { ...process.env, HOME: '/tmp' },
			detached: true
		});

		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
		proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

		const timer = setTimeout(() => {
			// Negative pid targets the whole group; the shell may already be gone, leaving
			// only the descendants that actually need killing.
			try {
				process.kill(-proc.pid!, 'SIGKILL');
			} catch {
				proc.kill('SIGKILL');
			}
			reject(new Error('Execution timed out after 30 seconds'));
		}, TIMEOUT_MS);

		proc.on('close', () => {
			clearTimeout(timer);
			resolve({ stdout, stderr });
		});

		proc.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}
