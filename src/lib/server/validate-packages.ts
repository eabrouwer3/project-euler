import type { Language } from '$lib/types.js';

/**
 * Mirrors runner/validate-packages.ts — duplicated rather than imported since the runner
 * is a separately built service (its own Docker context, no access to src/lib). Keep the
 * two in sync by hand. Python stays conservative because uv run --with is still
 * shell-interpolated downstream; TypeScript/Clojure allow more of their real ecosystem
 * syntax since neither touches a shell.
 */
const PYTHON_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(==[A-Za-z0-9._-]+)?$/;
const TYPESCRIPT_RE = /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(@[\^~]?[A-Za-z0-9.*-]+)?$/;
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
