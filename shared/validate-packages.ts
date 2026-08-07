export type Language = 'python' | 'typescript' | 'clojure' | 'rust' | 'cpp' | 'assembly';

/**
 * `uv run --with ${p}` is shell-interpolated (see server.ts), so this stays far more
 * conservative than real PEP 508 syntax — no ranges/extras/markers, since those rely on
 * shell-meaningful characters (`<`, `>`, `,`, `[`, `]`, spaces). Bare name or exact pin only.
 */
const PYTHON_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(==[A-Za-z0-9._-]+)?$/;

/** Written into package.json's dependencies map (JSON-encoded, never shell-interpolated) — npm scoped names and semver ranges are fine. */
const TYPESCRIPT_RE = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(@[\^~]?[A-Za-z0-9.*-]+)?$/;

/** The artifact/group half is spliced raw (unescaped) into deps.edn text (see server.ts), so it's restricted to identifier-safe characters to prevent edn structure injection. */
const CLOJURE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)?(@[A-Za-z0-9._-]+)?$/;

/** Both halves are spliced raw into Cargo.toml text (see server.ts), so neither may contain a quote, newline, or bracket that could close out of the value or open a new table. */
const RUST_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*(@[\^~=]?[A-Za-z0-9.*-]+)?$/;

/** `null` = the toolchain is invoked directly on a source file with no dependency manifest, so any package at all is a user error. */
const PACKAGE_PATTERNS: Record<Language, RegExp | null> = {
	python: PYTHON_RE,
	typescript: TYPESCRIPT_RE,
	clojure: CLOJURE_RE,
	rust: RUST_RE,
	cpp: null,
	assembly: null
};

/**
 * Splits a `name@version` specifier into its halves, tolerating the leading `@` of an npm
 * scope. `version` is undefined for a bare name, letting each runtime pick its own default.
 */
export function parsePackageSpec(spec: string): { name: string; version?: string } {
	const at = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);
	return at === -1 ? { name: spec } : { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

/**
 * Builds the Cargo manifest for a Rust solution. Lives next to `RUST_RE` because it is that
 * pattern — no quotes, brackets or newlines — that keeps a specifier from closing the string
 * it lands in and opening a table of its own.
 */
export function cargoToml(packages: string[]): string {
	const deps = packages
		.map((pkg) => {
			const { name, version = '*' } = parsePackageSpec(pkg);
			return `${name} = "${version}"`;
		})
		.join('\n');

	return `[package]
name = "solution"
version = "0.1.0"
edition = "2024"

[dependencies]
${deps}
`;
}

export function validatePackages(language: Language, packages: string[]): void {
	if (!Object.hasOwn(PACKAGE_PATTERNS, language)) {
		throw new Error(`Unsupported language: ${language}`);
	}

	const pattern = PACKAGE_PATTERNS[language];
	if (pattern === null) {
		if (packages.length > 0) throw new Error(`${language} does not support packages`);
		return;
	}

	for (const pkg of packages) {
		if (!pattern.test(pkg)) throw new Error(`Invalid package specifier: ${pkg}`);
	}
}
