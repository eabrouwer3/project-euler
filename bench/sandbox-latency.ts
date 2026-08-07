/**
 * Measures whether Railway Sandboxes can back the code runner inside its 30s budget.
 *
 * The question is not "how fast is a VM" but "how fast is the path we would actually take
 * per submission". That path is: get a sandbox that already has the toolchains, put a file
 * in it, run one command, tear it down. So the benchmark times each way of getting that
 * sandbox — cold from a template, forked from a warm one, restored from a checkpoint —
 * and then times a real solution end to end in each language.
 *
 *   bun add railway
 *   RAILWAY_API_TOKEN=... RAILWAY_ENVIRONMENT_ID=... bun bench/sandbox-latency.ts
 *
 * Flags:
 *   --quick    skip the toolchain template; measure bare sandbox lifecycle only
 *   --keep     leave the base sandbox and checkpoint behind for poking at
 *   --runs=N   samples per phase (default 3)
 */
import { Sandbox } from 'railway';
import { connect } from 'node:net';

const QUICK = process.argv.includes('--quick');
const KEEP = process.argv.includes('--keep');
const RUNS = Number(process.argv.find((a) => a.startsWith('--runs='))?.slice(7) ?? 3);

/**
 * Sandboxes default to us-west2 regardless of account preference, while the app and runner
 * services live in us-east4. Co-locating keeps exec round-trips off a cross-country hop,
 * which would otherwise be measured as if it were sandbox overhead.
 */
const REGION = process.env.BENCH_REGION ?? 'us-east4-eqdc4a';

/** Short idle timeout: sandboxes bill while idle, and a benchmark that dies should not leak cost. */
const IDLE_MINUTES = 1;

/**
 * A sandbox `exec` runs with no PATH in its environment. Interactive shells hide this — bash
 * falls back to a compiled-in default, so `command -v g++` answers and every toolchain looks
 * installed — but any tool that spawns a helper through PATH gets ENOENT. That is one bug
 * wearing three masks: g++ "cannot execute cc1plus", collect2 "cannot find ld", and rustc
 * "linker `cc` not found". None of them appear during a template build, which has a normal PATH.
 *
 * Baking it at create time fixes every command in the sandbox at once, rather than prefixing
 * each one and waiting to be surprised by the next tool that shells out.
 */
const SANDBOX_ENV = {
	PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.cargo/bin:/root/.local/bin'
};

const CHECKPOINT = 'euler-bench-base';

type Sample = { label: string; ms: number[] };
const samples: Sample[] = [];

/**
 * The lifecycle calls are GraphQL over 443, but `exec` and `files` open a WebSocket to
 * ssh.railway.com:2226. Restricted networks routinely allow the first and block the second,
 * which surfaces as an opaque "WebSocket connection failed" only after a sandbox is already
 * running and billing. Probe the port up front so the run can skip those phases and say why.
 */
function wsReachable(timeoutMs = 8000): Promise<boolean> {
	const host = process.env.RAILWAY_TCP_PROXY_WS
		? new URL(process.env.RAILWAY_TCP_PROXY_WS).hostname
		: 'ssh.railway.com';
	return new Promise((resolve) => {
		const sock = connect({ host, port: 2226, timeout: timeoutMs });
		const done = (ok: boolean) => {
			sock.destroy();
			resolve(ok);
		};
		sock.on('connect', () => done(true));
		sock.on('error', () => done(false));
		sock.on('timeout', () => done(false));
	});
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
	const t0 = performance.now();
	const out = await fn();
	const ms = performance.now() - t0;
	let s = samples.find((x) => x.label === label);
	if (!s) samples.push((s = { label, ms: [] }));
	s.ms.push(ms);
	return out;
}

/**
 * Mirrors runner/Dockerfile, minus the GCC 16 toolchain PPA — that PPA is Ubuntu-specific and
 * the sandbox base is Debian, so a real migration needs another route to C++26. The distro g++
 * is close enough here: this is measuring boot and exec latency, and what matters for those is
 * that the image carries a realistic amount of disk.
 */
function toolchainTemplate() {
	return Sandbox.template()
		.withPackages(
			'curl',
			'ca-certificates',
			'build-essential',
			'binutils',
			// bun's installer unpacks a zip and fails without this — the Dockerfile gets it
			// from its own base layer, so the dependency is easy to lose in a port.
			'unzip',
			'openjdk-21-jdk-headless'
		)
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
		// `withEnv` applies to build steps only and is not baked into sandboxes, so
		// UV_PYTHON_INSTALL_DIR is gone at runtime and `uv run` would re-download the
		// interpreter — about 23s, which is what made the first python e2e look like 29s.
		// A symlink at a fixed path needs no runtime environment at all.
		.run('ln -sf "$(/root/.local/bin/uv python find 3.13)" /usr/local/bin/python3.13')
		// Same reasoning for rustup, which installs under /root/.cargo and is off the runtime
		// PATH — the earlier run only passed because the benchmark's command prepended it.
		.run('ln -sf /root/.cargo/bin/rustc /usr/local/bin/rustc')
		.run('ln -sf /root/.cargo/bin/cargo /usr/local/bin/cargo')
		// Warm every cache *in /app*, the directory solutions actually run in: Clojure's
		// .cpcache is written relative to cwd, so warming it in /tmp bought nothing.
		.run('mkdir -p /app')
		.workdir('/app')
		.run('echo "(println 1)" > m.clj && echo "{:deps {}}" > deps.edn && clojure -M m.clj')
		.run('echo "console.log(1)" > w.ts && bun run w.ts && rm w.ts')
		.run('rm -f m.clj deps.edn');
}

/**
 * Run when a language produces the wrong answer. PATH comes first because an unset PATH was
 * the cause of every toolchain failure seen so far, and it is invisible to the checks that
 * look most reassuring — `command -v` answers from bash's fallback path whether or not the
 * environment has one, so it reports a healthy toolchain right up until something spawns.
 */
const DIAGNOSTIC = [
	'echo "--- PATH (empty brackets = the bug) ---"; echo "[$PATH]"',
	'echo "--- spawn helpers resolvable? ---"; g++ -print-prog-name=cc1plus; g++ -print-prog-name=ld',
	'echo "--- compile probes ---"; echo "int main(){return 0;}" > /tmp/p.cpp; ' +
		'g++ -o /tmp/p /tmp/p.cpp && echo CPP_OK; ' +
		'echo "fn main(){}" > /tmp/p.rs; rustc -o /tmp/pr /tmp/p.rs && echo RUST_OK',
	'echo "--- toolchains ---"; for c in python3.13 bun clojure rustc cargo cc g++ as ld; do printf "%s=%s\\n" "$c" "$(command -v $c || echo MISSING)"; done'
].join('; ');

/** One real solution per language, with the command the runner would issue. */
const SOLUTIONS = [
	{
		lang: 'python',
		file: 'main.py',
		code: 'print(sum(i for i in range(1000) if i%3==0 or i%5==0))',
		cmd: 'python3.13 main.py'
	},
	{
		lang: 'typescript',
		file: 'main.ts',
		code: 'let s=0; for(let i=0;i<1000;i++) if(i%3===0||i%5===0) s+=i; console.log(s)',
		cmd: 'bun run main.ts'
	},
	{
		lang: 'clojure',
		file: 'main.clj',
		code: '(println (reduce + (filter #(or (zero? (mod % 3)) (zero? (mod % 5))) (range 1000))))',
		cmd: 'clojure -M main.clj'
	},
	{
		lang: 'rust',
		file: 'main.rs',
		code: 'fn main(){ println!("{}", (0..1000).filter(|i| i%3==0||i%5==0).sum::<i32>()); }',
		// No PATH prefix on purpose: this now exercises the /usr/local/bin symlink, so a
		// regression shows up as a failure instead of being masked by the benchmark.
		cmd: 'rustc -O --edition 2021 -o main main.rs && ./main'
	},
	{
		lang: 'cpp',
		file: 'main.cpp',
		code: '#include <cstdio>\nint main(){int s=0;for(int i=0;i<1000;i++)if(i%3==0||i%5==0)s+=i;printf("%d\\n",s);}',
		cmd: 'g++ -O2 -o main main.cpp && ./main'
	},
	{
		lang: 'assembly',
		file: 'main.s',
		code: `.global _start
.section .text
_start:
  mov $1, %rax
  mov $1, %rdi
  lea msg(%rip), %rsi
  mov $7, %rdx
  syscall
  mov $60, %rax
  xor %rdi, %rdi
  syscall
.section .rodata
msg: .ascii "233168\\n"`,
		cmd: 'as -o main.o main.s && ld -o main main.o && ./main'
	}
];

function report() {
	const pad = (s: string, n: number) => s.padEnd(n);
	console.log('\n' + pad('phase', 34) + pad('min', 10) + pad('median', 10) + 'max');
	console.log('-'.repeat(64));
	for (const { label, ms } of samples) {
		const sorted = [...ms].sort((a, b) => a - b);
		const med = sorted[Math.floor(sorted.length / 2)];
		const f = (v: number) => `${(v / 1000).toFixed(2)}s`;
		console.log(
			pad(label, 34) + pad(f(sorted[0]), 10) + pad(f(med), 10) + f(sorted[sorted.length - 1])
		);
	}
}

async function main() {
	if (!process.env.RAILWAY_API_TOKEN) throw new Error('set RAILWAY_API_TOKEN');
	if (!process.env.RAILWAY_ENVIRONMENT_ID) throw new Error('set RAILWAY_ENVIRONMENT_ID');

	const opts = { region: REGION, idleTimeoutMinutes: IDLE_MINUTES, env: SANDBOX_ENV };
	const canExec = await wsReachable();
	console.log(`region=${REGION} runs=${RUNS} quick=${QUICK} exec=${canExec ? 'yes' : 'BLOCKED'}`);
	if (!canExec) {
		console.log(
			'ssh.railway.com:2226 unreachable — skipping exec/files phases.\n' +
				'Lifecycle timings below are still real; run from an unrestricted network for e2e.'
		);
	}

	// --- bare lifecycle: the floor, with no toolchains on disk ---
	for (let i = 0; i < RUNS; i++) {
		const sbx = await time('create (bare)', () => Sandbox.create(opts));
		if (canExec) await time('exec round-trip (trivial)', () => sbx.exec('true'));
		await time('destroy', () => sbx.destroy());
	}

	if (QUICK) return report();

	// --- template: built once, content-addressed and cached by Railway ---
	const template = toolchainTemplate();
	await time('template build (cold or cached)', () => template.build());

	for (let i = 0; i < RUNS; i++) {
		const sbx = await time('create (from template)', () => Sandbox.create(template, opts));
		await time('destroy', () => sbx.destroy());
	}

	// --- the shape a real submission would take: keep a warm base, fork per run ---
	const base = await Sandbox.create(template, opts);
	for (let i = 0; i < RUNS; i++) {
		const fork = await time('fork (from warm base)', () => base.fork(opts));
		await time('destroy', () => fork.destroy());
	}

	await time('checkpoint capture', () => base.checkpoint(CHECKPOINT));
	for (let i = 0; i < RUNS; i++) {
		const sbx = await time('create (from checkpoint)', () => Sandbox.create(CHECKPOINT, opts));
		await time('destroy', () => sbx.destroy());
	}

	// --- end to end, per language ---
	// Provisions from the checkpoint rather than forking the base: it measured ~2.4s faster
	// and needs no permanently running base sandbox, so it is the shape a port should use.
	let diagnosed = false;
	for (const s of canExec ? SOLUTIONS : []) {
		for (let i = 0; i < RUNS; i++) {
			await time(`e2e ${s.lang}`, async () => {
				const sbx = await Sandbox.create(CHECKPOINT, opts);
				try {
					await sbx.files.write(`/app/${s.file}`, s.code);
					const r = await sbx.exec(s.cmd, { cwd: '/app', timeoutSec: 30 });
					if (!r.stdout.includes('233168')) {
						console.error(`  ! ${s.lang} wrong output: ${r.stdout.trim()} ${r.stderr.trim()}`);
						if (!diagnosed) {
							diagnosed = true;
							const d = await sbx.exec(DIAGNOSTIC, { timeoutSec: 60 });
							console.error(`--- diagnostic (${s.lang}) ---\n${d.stdout}${d.stderr}---`);
						}
					}
				} finally {
					await sbx.destroy();
				}
			});
		}
	}

	if (!KEEP) {
		await base.destroy();
		await Sandbox.deleteCheckpoint(CHECKPOINT).catch(() => {});
	}
	report();

	const e2e = samples.filter((s) => s.label.startsWith('e2e')).flatMap((s) => s.ms);
	if (e2e.length === 0) {
		const forks = samples.find((s) => s.label.startsWith('fork'))?.ms ?? [];
		if (forks.length) {
			console.log(
				`\nno e2e (exec blocked). Fork alone costs ${(Math.max(...forks) / 1000).toFixed(2)}s ` +
					'of the 30s budget before the solution has run at all.'
			);
		}
		return;
	}
	const worst = Math.max(...e2e) / 1000;
	console.log(
		`\nworst end-to-end: ${worst.toFixed(2)}s against a 30s budget — ` +
			(worst < 15 ? 'comfortable' : worst < 30 ? 'tight' : 'does not fit')
	);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
