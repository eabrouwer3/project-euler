import http from 'http';
import { cargoToml, parsePackageSpec, validatePackages, type Language } from '@euler/shared';
import { ensureCheckpoint, runInSandbox } from './sandbox.ts';

const PORT = 3001;
const TIMEOUT_SEC = 30;

for (const required of ['RAILWAY_API_TOKEN', 'RAILWAY_ENVIRONMENT_ID']) {
	if (!process.env[required]) {
		// Fail at boot rather than on the first submission: without these there is no sandbox to
		// run in, and the previous design's habit of degrading quietly is what hid the missing
		// gVisor for as long as it did.
		console.error(`${required} is not set — the runner cannot provision sandboxes`);
		process.exit(1);
	}
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

	let result: { stdout: string; stderr: string };
	try {
		result = await execCode(language, code, packages ?? []);
	} catch (err) {
		result = { stdout: '', stderr: String(err) };
	}

	res.writeHead(200, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(result));
});

/**
 * Warming the checkpoint before listening means the first submission after a deploy pays ~2s
 * to boot a sandbox instead of ~45s to build the toolchain template. A failure here is not
 * fatal — `runInSandbox` will retry the build — so the runner still comes up.
 */
ensureCheckpoint()
	.catch((err) => console.error(`checkpoint warm-up failed, will retry on first run: ${err}`))
	.finally(() => server.listen(PORT, () => console.log(`Runner listening on :${PORT}`)));

async function execCode(
	language: Language,
	code: string,
	packages: string[]
): Promise<{ stdout: string; stderr: string }> {
	validatePackages(language, packages);

	const files: Record<string, string> = {};
	let command: string;

	switch (language) {
		case 'python': {
			files['main.py'] = code;
			// uv only earns its resolution step when there is something to resolve; the bare
			// interpreter is at a fixed path precisely so the common case skips it.
			command =
				packages.length > 0
					? `uv run --python 3.13 ${packages.map((p) => `--with ${p}`).join(' ')} main.py`
					: 'python3.13 main.py';
			break;
		}
		case 'typescript': {
			files['main.ts'] = code;
			const dependencies: Record<string, string> = {};
			for (const pkg of packages) {
				const { name, version = '*' } = parsePackageSpec(pkg);
				dependencies[name] = version;
			}
			files['package.json'] = JSON.stringify(
				{ name: 'solution', private: true, dependencies },
				null,
				2
			);
			command =
				packages.length > 0 ? 'bun install --no-progress && bun run main.ts' : 'bun run main.ts';
			break;
		}
		case 'clojure': {
			files['main.clj'] = code;
			// A coordinate is `{:mvn/version "x"}` — one namespaced keyword, not a nested map.
			// JSON.stringify would emit `{"mvn":{"version":"x"}}`, which the edn reader rejects.
			const deps = packages
				.map((pkg) => {
					const [name, version = 'RELEASE'] = pkg.split('@');
					return `${name} {:mvn/version ${JSON.stringify(version)}}`;
				})
				.join(' ');
			files['deps.edn'] = `{:deps {${deps}}}`;
			command = 'clojure -M main.clj';
			break;
		}
		case 'rust': {
			// Cargo only earns its build overhead when there are crates to resolve
			if (packages.length === 0) {
				files['main.rs'] = code;
				command = 'rustc -O --edition 2024 -o main main.rs && ./main';
				break;
			}
			files['src/main.rs'] = code;
			files['Cargo.toml'] = cargoToml(packages);
			command = 'cargo run --quiet --release';
			break;
		}
		case 'cpp': {
			files['main.cpp'] = code;
			// g++-15 rather than the base image's g++ 14: the Dockerfile targeted C++26 via a
			// GCC 16 PPA that only exists for Ubuntu, and 15 is the closest plain Debian package.
			command = 'g++-15 -O2 -std=c++26 -o main main.cpp && ./main';
			break;
		}
		case 'assembly': {
			files['main.s'] = code;
			command = 'as -o main.o main.s && ld -o main main.o && ./main';
			break;
		}
	}

	const { stdout, stderr, timedOut } = await runInSandbox(files, command, TIMEOUT_SEC);

	if (timedOut) {
		return { stdout, stderr: `Execution timed out after ${TIMEOUT_SEC} seconds\n${stderr}` };
	}
	return { stdout, stderr };
}
