import { spawn } from 'child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { cargoToml, parsePackageSpec } from '@euler/shared';
import type { Language } from '$lib/types.js';

const TIMEOUT_MS = 30_000;
const RUNNER_URL = process.env.RUNNER_URL;

export async function runCode(
	language: Language,
	code: string,
	packages: string[]
): Promise<{ stdout: string; stderr: string }> {
	if (RUNNER_URL) {
		const res = await fetch(`${RUNNER_URL}/run`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ language, code, packages }),
			signal: AbortSignal.timeout(35_000)
		});
		return res.json();
	}

	const dir = await mkdtemp(join(tmpdir(), 'euler-'));

	try {
		const args = await writeFiles(language, code, packages, dir);
		return await execDocker(args, TIMEOUT_MS);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function writeFiles(
	language: Language,
	code: string,
	packages: string[],
	dir: string
): Promise<string[]> {
	const commonFlags = [
		'run',
		'--rm',
		'--network',
		'none',
		'--memory',
		'256m',
		'--cpus',
		'0.5',
		'-v',
		`${dir}:/app`,
		'-w',
		'/app'
	];

	switch (language) {
		case 'python': {
			await writeFile(join(dir, 'main.py'), code);
			await writeFile(join(dir, 'requirements.txt'), packages.join('\n'));
			const cmd =
				packages.length > 0
					? 'pip install -r requirements.txt -q && python main.py'
					: 'python main.py';
			return [...commonFlags, 'python:3.13-slim', 'sh', '-c', cmd];
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
			const cmd =
				packages.length > 0 ? 'bun install --no-progress && bun run main.ts' : 'bun run main.ts';
			// The image's default `bun` user can't write node_modules into the bind-mounted dir
			return [...commonFlags, '--user', 'root', 'oven/bun:1', 'sh', '-c', cmd];
		}

		case 'clojure': {
			await writeFile(join(dir, 'main.clj'), code);
			const deps: Record<string, unknown> = {};
			for (const pkg of packages) {
				const [name, version = 'RELEASE'] = pkg.split('@');
				deps[name] = { mvn: { version } };
			}
			await writeFile(join(dir, 'deps.edn'), `{:deps {${Object.entries(deps).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(' ')}}}`);
			return [...commonFlags, 'clojure', 'clj', '-M', 'main.clj'];
		}

		case 'rust': {
			// Cargo only earns its build overhead when there are crates to resolve
			if (packages.length === 0) {
				await writeFile(join(dir, 'main.rs'), code);
				return [...commonFlags, 'rust:1-slim', 'sh', '-c', 'rustc -O --edition 2024 -o main main.rs && ./main'];
			}
			await mkdir(join(dir, 'src'), { recursive: true });
			await writeFile(join(dir, 'src', 'main.rs'), code);
			await writeFile(join(dir, 'Cargo.toml'), cargoToml(packages));
			return [...commonFlags, 'rust:1-slim', 'sh', '-c', 'cargo run --quiet --release'];
		}

		case 'cpp': {
			await writeFile(join(dir, 'main.cpp'), code);
			return [
				...commonFlags,
				'gcc:16',
				'sh',
				'-c',
				'g++ -O2 -std=c++26 -o main main.cpp && ./main'
			];
		}

		case 'assembly': {
			await writeFile(join(dir, 'main.s'), code);
			return [...commonFlags, 'gcc:16', 'sh', '-c', 'as -o main.o main.s && ld -o main main.o && ./main'];
		}
	}
}

function execDocker(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const proc = spawn('docker', args, { env: process.env });
		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
		proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

		const timer = setTimeout(() => {
			proc.kill('SIGKILL');
			reject(new Error('Execution timed out after 30 seconds'));
		}, timeoutMs);

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
