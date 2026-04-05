import { spawn } from 'child_process';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
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
			const importsMap: Record<string, string> = {};
			for (const pkg of packages) {
				importsMap[pkg] = `npm:${pkg}`;
			}
			await writeFile(
				join(dir, 'deno.json'),
				JSON.stringify({ imports: importsMap }, null, 2)
			);
			return [
				...commonFlags,
				'denoland/deno',
				'run',
				'--allow-read',
				'--allow-env',
				'main.ts'
			];
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
