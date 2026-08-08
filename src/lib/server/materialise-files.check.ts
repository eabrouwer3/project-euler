/**
 * Solution source is spliced into a shell command so a run costs one round trip to the sandbox
 * instead of two. That makes every solution an input to a shell, so these assertions check the
 * only two things that matter: the script is valid shell, and each file arrives byte-for-byte.
 *
 * Run against real bash rather than by inspecting the string, because the property under test
 * is what a shell does with it, not what it looks like.
 */
import { materialiseFiles, buildScript } from './sandbox.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`FAIL: ${message}`);
		process.exit(1);
	}
}

/** Runs the generated script in a scratch dir and returns what actually landed on disk. */
function realise(files: Record<string, string>): Record<string, string> {
	const dir = mkdtempSync(join(tmpdir(), 'euler-materialise-'));
	try {
		const script = materialiseFiles(files);

		const parsed = spawnSync('bash', ['-n'], { input: script });
		assert(parsed.status === 0, `generated script is not valid shell: ${parsed.stderr}`);

		const ran = spawnSync('bash', ['-s'], { input: script, cwd: dir });
		assert(ran.status === 0, `generated script failed: ${ran.stderr}`);

		return Object.fromEntries(
			Object.keys(files).map((name) => [name, readFileSync(join(dir, name), 'utf8')])
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** A trailing newline is added by the heredoc; compare on that basis rather than pretending not. */
function assertRoundTrip(label: string, files: Record<string, string>): void {
	const out = realise(files);
	for (const [name, content] of Object.entries(files)) {
		assert(out[name] === `${content}\n`, `${label}: ${name} did not round-trip (got ${JSON.stringify(out[name])})`);
	}
}

// Nothing in a solution may be expanded, executed, or reinterpreted by the shell carrying it.
assertRoundTrip('shell metacharacters', {
	'main.py': [
		'import os',
		'print("$HOME and `whoami` and $(id)")',
		"print('single \\' quote')",
		'print("semi; colon && amp | pipe > redirect")',
		'print("back\\\\slash")',
		'# ${IFS}'
	].join('\n')
});

// A solution that contains heredoc-looking lines must not be able to end its own heredoc.
assertRoundTrip('heredoc-shaped content', {
	'main.py': ['EOF', 'EULER_EOF', "print('EOF')", 'EULER_EOF_0000000000000000'].join('\n')
});

// Rust is the one language written into a subdirectory, so the mkdir path is exercised too.
assertRoundTrip('nested paths', {
	'src/main.rs': 'fn main() { println!("{}", 1); }',
	'Cargo.toml': '[package]\nname = "solution"\n'
});

assertRoundTrip('unicode and blank lines', {
	'main.py': 'print("héllo → 世界")\n\n\nprint("after blanks")'
});

// An empty set must not emit a stray newline that would turn into an empty command.
assert(materialiseFiles({}) === '', 'no files should produce an empty prelude');

// Two files in one prelude must get distinct delimiters and not bleed into each other.
const multi = realise({ 'a.txt': 'alpha', 'b.txt': 'beta' });
assert(multi['a.txt'] === 'alpha\n' && multi['b.txt'] === 'beta\n', 'multiple files bled together');

// --- the full script a run sends -------------------------------------------------------------

/** Runs a complete script in a scratch dir standing in for /app, and reports what it produced. */
function runScript(
	directory: string,
	files: Record<string, string>,
	command: string
): { stdout: string; root: string } {
	const root = mkdtempSync(join(tmpdir(), 'euler-script-'));
	const script = buildScript(directory, files, command);

	const parsed = spawnSync('bash', ['-n'], { input: script });
	assert(parsed.status === 0, `script is not valid shell: ${parsed.stderr}`);

	const ran = spawnSync('bash', ['-s'], { input: script, cwd: root, encoding: 'utf8' });
	assert(ran.status === 0, `script failed: ${ran.stderr}`);

	return { stdout: ran.stdout, root };
}

// The solution must land in its own directory and run there, not in the parent.
const solve = runScript('p1-python', { 'main.py': 'print("solved")' }, 'cat main.py && pwd');
assert(solve.stdout.includes('solved'), 'solution file was not readable from its own directory');
assert(solve.stdout.includes('p1-python'), `run did not happen in its own directory: ${solve.stdout}`);

// Two problems must not see each other's sources, which is the point of the per-problem directory.
const shared = mkdtempSync(join(tmpdir(), 'euler-two-'));
for (const [dir, body] of [
	['p1-python', 'print(1)'],
	['p2-python', 'print(2)']
]) {
	const ran = spawnSync('bash', ['-s'], {
		input: buildScript(dir, { 'main.py': body }, 'true'),
		cwd: shared
	});
	assert(ran.status === 0, `writing ${dir} failed: ${ran.stderr}`);
}
assert(
	readFileSync(join(shared, 'p1-python/main.py'), 'utf8').trim() === 'print(1)' &&
		readFileSync(join(shared, 'p2-python/main.py'), 'utf8').trim() === 'print(2)',
	'one problem overwrote the other'
);
rmSync(shared, { recursive: true, force: true });

// Re-running the same problem must be safe: the stray-reaper reads the marker the last run left,
// and killing a process group that no longer exists must not abort the run.
const repeat = mkdtempSync(join(tmpdir(), 'euler-repeat-'));
for (let i = 0; i < 3; i++) {
	const ran = spawnSync('bash', ['-s'], {
		input: buildScript('p7-cpp', { 'main.cpp': `// run ${i}` }, 'echo ran'),
		cwd: repeat,
		encoding: 'utf8'
	});
	assert(ran.status === 0, `repeat run ${i} failed: ${ran.stderr}`);
	assert(ran.stdout.includes('ran'), `repeat run ${i} produced no output`);
}
rmSync(repeat, { recursive: true, force: true });

rmSync(solve.root, { recursive: true, force: true });

console.log('PASS: materialise-files assertions hold');
