import http from 'http';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn, execFileSync } from 'child_process';
import { cargoToml, parsePackageSpec, validatePackages, type Language } from '@euler/shared';

const PORT = 3001;
const TIMEOUT_MS = 30_000;

// Test gVisor availability once at startup
let useGvisor = false;
try {
	execFileSync('runsc', ['--rootless', '--platform=ptrace', 'do', '--network=none', '--', 'echo', 'ok'], {
		stdio: 'ignore',
		timeout: 5000
	});
	useGvisor = true;
	console.log('gVisor (runsc) available — sandboxing enabled');
} catch {
	// ponytail: no gVisor means no network isolation either (ulimit only caps CPU time);
	// upgrade path is making runsc a hard requirement instead of a silent fallback
	console.log('gVisor not available — running with ulimit only');
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

async function execCode(
	language: Language,
	code: string,
	packages: string[],
	dir: string
): Promise<{ stdout: string; stderr: string }> {
	validatePackages(language, packages);

	let cmd: string;

	switch (language) {
		case 'python': {
			await writeFile(join(dir, 'main.py'), code);
			const withFlags = packages.map((p) => `--with ${p}`).join(' ');
			cmd = packages.length > 0
				? `uv run --python 3.13 ${withFlags} main.py`
				: 'uv run --python 3.13 main.py';
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
			cmd =
				packages.length > 0 ? 'bun install --no-progress && bun run main.ts' : 'bun run main.ts';
			break;
		}
		case 'clojure': {
			await writeFile(join(dir, 'main.clj'), code);
			const deps: Record<string, unknown> = {};
			for (const pkg of packages) {
				const [name, version = 'RELEASE'] = pkg.split('@');
				deps[name] = { mvn: { version } };
			}
			await writeFile(
				join(dir, 'deps.edn'),
				`{:deps {${Object.entries(deps)
					.map(([k, v]) => `${k} ${JSON.stringify(v)}`)
					.join(' ')}}}`
			);
			cmd = 'clojure -M main.clj';
			break;
		}
		case 'rust': {
			// Cargo only earns its build overhead when there are crates to resolve
			if (packages.length === 0) {
				await writeFile(join(dir, 'main.rs'), code);
				cmd = 'rustc -O -o main main.rs && ./main';
				break;
			}
			await mkdir(join(dir, 'src'), { recursive: true });
			await writeFile(join(dir, 'src', 'main.rs'), code);
			await writeFile(join(dir, 'Cargo.toml'), cargoToml(packages));
			cmd = 'cargo run --quiet --release';
			break;
		}
		case 'cpp': {
			await writeFile(join(dir, 'main.cpp'), code);
			cmd = 'g++ -O2 -std=c++23 -o main main.cpp && ./main';
			break;
		}
		case 'assembly': {
			await writeFile(join(dir, 'main.s'), code);
			cmd = 'as -o main.o main.s && ld -o main main.o && ./main';
			break;
		}
	}

	return spawnWithTimeout(cmd, dir);
}

function spawnWithTimeout(
	cmd: string,
	cwd: string
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const sandboxedCmd = useGvisor
			? `runsc --rootless --platform=ptrace do --network=none -- sh -c ${JSON.stringify(cmd)}`
			: cmd;

		const fullCmd = `ulimit -t 25; ${sandboxedCmd}`;

		const proc = spawn('sh', ['-c', fullCmd], {
			cwd,
			env: { ...process.env, HOME: '/tmp' }
		});

		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
		proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

		const timer = setTimeout(() => {
			proc.kill('SIGKILL');
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
