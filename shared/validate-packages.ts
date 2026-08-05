export type Language = 'python' | 'typescript' | 'clojure';

/**
 * `uv run --with ${p}` is shell-interpolated (see server.ts), so this stays far more
 * conservative than real PEP 508 syntax — no ranges/extras/markers, since those rely on
 * shell-meaningful characters (`<`, `>`, `,`, `[`, `]`, spaces). Bare name or exact pin only.
 */
const PYTHON_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(==[A-Za-z0-9._-]+)?$/;

/** Written into deno.json's import map (JSON-encoded, never shell-interpolated) — npm scoped names and semver ranges are fine. */
const TYPESCRIPT_RE = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(@[\^~]?[A-Za-z0-9.*-]+)?$/;

/** The artifact/group half is spliced raw (unescaped) into deps.edn text (see server.ts), so it's restricted to identifier-safe characters to prevent edn structure injection. */
const CLOJURE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)?(@[A-Za-z0-9._-]+)?$/;

const PACKAGE_PATTERNS: Record<Language, RegExp> = {
	python: PYTHON_RE,
	typescript: TYPESCRIPT_RE,
	clojure: CLOJURE_RE
};

export function validatePackages(language: Language, packages: string[]): void {
	const pattern = PACKAGE_PATTERNS[language];
	for (const pkg of packages) {
		if (!pattern.test(pkg)) throw new Error(`Invalid package specifier: ${pkg}`);
	}
}
