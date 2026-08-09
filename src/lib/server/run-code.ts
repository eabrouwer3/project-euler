import { cargoToml, parsePackageSpec, validatePackages } from './validate-packages.js';
import { runInSandbox, shellQuote, WORKDIR } from './sandbox.js';
import { loadProblemAttachments } from './problems.js';
import { solutionFiles } from '$lib/constants.js';
import type { Language, RunEvent } from '$lib/types.js';

/**
 * Project Euler's own guidance is the one-minute rule: a problem is meant to have a solution
 * that runs in under a minute on a modest machine, and needing longer means the brute force
 * wants replacing with the insight. So the deadline is that minute — long enough that a solve
 * meeting the site's own bar is never cut off, and short enough to still say plainly that an
 * algorithm is the wrong one.
 */
const TIMEOUT_SEC = 60;

/**
 * The data files a problem hands out, ready to be written next to the solution.
 *
 * Never fatal: a solution that does not read the file runs fine without it, and one that does
 * gets a named warning on stderr instead of the language's own "no such file", which says
 * nothing about why it is missing.
 */
async function problemFiles(problemId: number): Promise<{
	files: Record<string, string>;
	links: string[];
	warning: string;
}> {
	const { attachments, missing } = await loadProblemAttachments(problemId).catch((err) => {
		console.error(`problem ${problemId} attachments unavailable: ${err}`);
		return { attachments: [], missing: ['(projecteuler.net could not be reached)'] };
	});

	const files: Record<string, string> = {};
	const links: string[] = [];

	for (const { name, aliases, content } of attachments) {
		files[name] = content;
		// Symlinks rather than copies: the alternate spellings exist so a solution that guessed
		// the other name still opens the file, not so there are two files to keep in step.
		for (const alias of aliases) links.push(`ln -sfn ${shellQuote(name)} ${shellQuote(alias)}`);
	}

	const warning =
		missing.length > 0 ? `Warning: could not fetch problem data ${missing.join(', ')}\n` : '';

	return { files, links, warning };
}

/**
 * Turns a submission into the files and single command that produce its output, then runs it
 * in the user's sandbox. There used to be a second implementation of this behind an HTTP hop —
 * a `runner` service that had itself stopped executing anything once solutions moved into
 * sandboxes — plus a local-Docker path here that had already drifted from it. Both are gone.
 *
 * Reports through `emit` rather than returning what the run printed: the deadline gives a solve
 * a whole minute, and a minute of accumulating output to hand over at the end is a minute of
 * watching a spinner. Everything a reader sees comes through here in the order it happened —
 * the warning about a data file that could not be fetched, the run's own two streams, and last
 * the deadline, if that is what stopped it.
 */
export async function runCode(
	userId: string,
	problemId: number,
	language: Language,
	code: string,
	packages: string[],
	emit: (event: RunEvent) => void
): Promise<void> {
	validatePackages(language, packages);

	// Fetched alongside the rest of the setup; the page's warm-up has usually cached it already.
	const problemData = problemFiles(problemId);

	// The names the solution and its manifest are written under, and that the commands below
	// compile and run. Shared with the editor, which shows the reader what is in the working
	// directory alongside the problem's own data files. Each case knows whether its language
	// has a manifest at all, so `manifest` is asserted where the table guarantees one.
	const { source, manifest } = solutionFiles(language, packages);

	const files: Record<string, string> = {};
	let command: string;
	let clojureCache = false;

	switch (language) {
		case 'python': {
			files[source] = code;
			// uv only earns its resolution step when there is something to resolve; the bare
			// interpreter sits at a fixed path precisely so the common case can skip it.
			command =
				packages.length > 0
					? `uv run --python 3.13 ${packages.map((p) => `--with ${p}`).join(' ')} ${source}`
					: `python3.13 ${source}`;
			break;
		}
		case 'typescript': {
			files[source] = code;
			const dependencies: Record<string, string> = {};
			for (const pkg of packages) {
				const { name, version = '*' } = parsePackageSpec(pkg);
				dependencies[name] = version;
			}
			files[manifest!] = JSON.stringify(
				{ name: 'solution', private: true, dependencies },
				null,
				2
			);
			command =
				packages.length > 0
					? `bun install --no-progress && bun run ${source}`
					: `bun run ${source}`;
			break;
		}
		case 'clojure': {
			files[source] = code;
			// A project deps.edn beats CLJ_CACHE, so the classpath cache lands in ./.cpcache — per
			// directory, which would strand the one the template warmed in /app and make the first
			// solve of every problem resolve the classpath again. The symlink puts it back: entries
			// are keyed by a hash of the deps, so problems with different deps share it safely.
			clojureCache = true;
			// A coordinate is `{:mvn/version "x"}` — one namespaced keyword, not a nested map.
			// JSON.stringify would emit `{"mvn":{"version":"x"}}`, whose quoted keys the edn
			// reader rejects outright ("Invalid token: :").
			const deps = packages
				.map((pkg) => {
					const [name, version = 'RELEASE'] = pkg.split('@');
					return `${name} {:mvn/version ${JSON.stringify(version)}}`;
				})
				.join(' ');
			files[manifest!] = `{:deps {${deps}}}`;
			command = `clojure -M ${source}`;
			break;
		}
		case 'rust': {
			// Cargo only earns its build overhead when there are crates to resolve, which is also
			// why `source` moves: a crate is built from src/, a lone file is compiled where it sits.
			files[source] = code;
			if (packages.length === 0) {
				command = `rustc -O --edition 2024 -o main ${source} && ./main`;
				break;
			}
			files[manifest!] = cargoToml(packages);
			command = 'cargo run --quiet --release';
			break;
		}
		case 'cpp': {
			files[source] = code;
			// g++-15 rather than the sandbox base's g++ 14: the old Dockerfile targeted C++26 via
			// a GCC 16 PPA that only exists for Ubuntu, and 15 is the closest plain Debian package.
			//
			// stdbuf line-buffers the program's stdio, so a solution stopped at the deadline has
			// already written what it printed instead of taking an unflushed 4K of it to the grave —
			// glibc block-buffers a pipe, which is what a run's stdout is. Only C++ needs the wrapper:
			// Python has PYTHONUNBUFFERED from the sandbox env, Rust line-buffers stdout of its own
			// accord, the JVM flushes each println, Bun writes through, and assembly is syscalls.
			// A solution that turns off `sync_with_stdio` is buffering by hand and keeps its own.
			command = `g++-15 -O2 -std=c++26 -o main ${source} && stdbuf -oL -eL ./main`;
			break;
		}
		case 'assembly': {
			files[source] = code;
			command = `as -o main.o ${source} && ld -o main main.o && ./main`;
			break;
		}
	}

	if (clojureCache) command = `ln -sfn ${WORKDIR}/.cpcache .cpcache\n${command}`;

	// Sources are written exactly as given, and the editor does not necessarily leave a trailing
	// newline. Compilers have long since stopped minding, but nothing is gained by finding out
	// which of six toolchains still does.
	for (const [name, content] of Object.entries(files)) {
		if (!content.endsWith('\n')) files[name] = `${content}\n`;
	}

	// The problem's own data lands in the working directory, so `open('names.txt')` just works.
	// Written before the solution's files so a solution can never be shadowed by one of them.
	const { files: dataFiles, links, warning } = await problemData;
	const allFiles = { ...dataFiles, ...files };
	if (links.length > 0) command = `${links.join('\n')}\n${command}`;

	// One directory per problem and language: a solve never overwrites another's sources, and a
	// user can run two problems at once. Both halves are already constrained — problemId is a
	// number and language is one of a fixed set — so the name cannot escape its parent.
	const directory = `p${problemId}-${language}`;

	if (warning) emit({ type: 'stderr', text: warning });

	// Whether the last thing written to stderr left the line open, so the deadline's own line
	// below starts on one of its own instead of running on from a half-finished traceback.
	let stderrAtLineStart = true;

	emit({ type: 'started' });

	const { timedOut } = await runInSandbox(userId, directory, allFiles, command, TIMEOUT_SEC, {
		chunk: (stream, text) => {
			if (stream === 'stderr') stderrAtLineStart = text.endsWith('\n');
			emit({ type: stream, text });
		},
		restarted: () => {
			stderrAtLineStart = true;
			emit({ type: 'reset' });
			if (warning) emit({ type: 'stderr', text: warning });
		}
	});

	if (timedOut) {
		// After the run's own output rather than before it. Everything the solution managed to
		// print survives the deadline (see runWithDeadline), and it is only worth reading in the
		// order it happened: the logs are what the solution did, and this is why they stop there.
		const gap = stderrAtLineStart ? '' : '\n';
		emit({ type: 'stderr', text: `${gap}Execution timed out after ${TIMEOUT_SEC} seconds\n` });
	}
}
