import { cargoToml, parsePackageSpec, validatePackages } from './validate-packages.js';
import { runInSandbox } from './sandbox.js';
import type { Language } from '$lib/types.js';

const TIMEOUT_SEC = 30;

/**
 * Turns a submission into the files and single command that produce its output, then runs it
 * in a throwaway VM. There used to be a second implementation of this behind an HTTP hop —
 * a `runner` service that had itself stopped executing anything once solutions moved into
 * sandboxes — plus a local-Docker path here that had already drifted from it. Both are gone.
 */
export async function runCode(
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
			// interpreter sits at a fixed path precisely so the common case can skip it.
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
			// JSON.stringify would emit `{"mvn":{"version":"x"}}`, whose quoted keys the edn
			// reader rejects outright ("Invalid token: :").
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
			// g++-15 rather than the sandbox base's g++ 14: the old Dockerfile targeted C++26 via
			// a GCC 16 PPA that only exists for Ubuntu, and 15 is the closest plain Debian package.
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
