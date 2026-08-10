import type { Language } from './types.js';

export const LANGUAGES: Language[] = ['python', 'typescript', 'clojure', 'rust', 'cpp', 'assembly'];

export const BOILERPLATE: Record<Language, string> = {
	python: `if __name__ == '__main__':
    print('Hello, World!')
`,
	typescript: `if (import.meta.main) {
  console.log('Hello, World!')
}
`,
	clojure: `(println "Hello, World!")`,
	rust: `fn main() {
    println!("Hello, World!");
}
`,
	cpp: `#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
}
`,
	// AArch64, and `//` opens the comments rather than `#`: on this architecture `#` is the
	// immediate prefix, and gas rejects `mov x0, #1 # write` outright ("unexpected characters
	// following instruction"). An address is two instructions because a 64-bit one does not fit
	// in a 32-bit encoding — adrp lands on msg's 4K page and the :lo12: relocation adds the
	// offset within it.
	assembly: `        .section .rodata
msg:    .ascii  "Hello, World!\\n"
        .set    msglen, . - msg

        .section .text
        .globl  _start
_start:
        mov     x0, #1                  // stdout
        adrp    x1, msg
        add     x1, x1, :lo12:msg
        mov     x2, #msglen
        mov     x8, #64                 // write
        svc     #0

        mov     x0, #0                  // status
        mov     x8, #93                 // exit
        svc     #0
`
};

export const LANGUAGE_LABELS: Record<Language, string> = {
	python: 'Python 3.13',
	typescript: 'TypeScript (Bun 1)',
	clojure: 'Clojure 1.12 (Java 21)',
	rust: 'Rust (stable)',
	cpp: 'C++26 (GCC 16)',
	assembly: 'AArch64 Assembly (GNU as)'
};

export const LANGUAGE_ABBR: Record<Language, string> = {
	python: 'PY',
	typescript: 'TS',
	clojure: 'CLJ',
	rust: 'RS',
	cpp: 'C++',
	assembly: 'ASM'
};

/**
 * C++ and assembly are compiled straight from a source file with no dependency manifest, so
 * the package UI is hidden for them — `validatePackages` rejects packages there outright.
 */
export const SUPPORTS_PACKAGES: Record<Language, boolean> = {
	python: true,
	typescript: true,
	clojure: true,
	rust: true,
	cpp: false,
	assembly: false
};

/**
 * The characters the mobile key bar offers above the on-screen keyboard, per language. Phone
 * keyboards bury every one of these behind at least one modifier page, and some — `|`, `~`, `%`
 * — behind two, which is what makes writing code on them miserable.
 *
 * Ordered by how often the language actually needs them, because the row scrolls: whatever sits
 * past the sixth or seventh key is a swipe away, so brackets lead everywhere and the language's
 * own punctuation comes next.
 */
export const MOBILE_KEYS: Record<Language, string[]> = {
	python: [':', '(', ')', '[', ']', '{', '}', "'", '"', '_', '=', '<', '>', '#', '%', '*', '+', '-', '/', ',', '.', '|', '&'],
	typescript: ['(', ')', '{', '}', '[', ']', "'", '"', '`', '=', '>', '<', ';', ':', '.', ',', '&', '|', '!', '?', '+', '-', '*', '/', '%', '$', '_'],
	clojure: ['(', ')', '[', ']', '{', '}', '"', '-', '>', '<', ':', '#', "'", '=', '?', '!', '*', '%', '_', '.', '/', '&'],
	rust: ['(', ')', '{', '}', '[', ']', '<', '>', '&', ':', ';', '"', "'", '!', '?', '=', '|', '_', '.', ',', '*', '+', '-', '/', '%', '#'],
	cpp: ['(', ')', '{', '}', '[', ']', '<', '>', '"', "'", ';', ':', '&', '*', '=', '!', '|', '+', '-', '/', '%', '#', '.', ',', '_'],
	// `#` and `[` lead because AArch64 spells every immediate and every load with them; `%` and
	// `$` are gone with AT&T syntax, which had no other user.
	assembly: ['#', ',', '[', ']', ':', '.', '/', '!', '=', '-', '+', '*', '_', '(', ')', '<', '>', '&', '|']
};

/**
 * What a run writes for the solution itself: the source file the editor's contents land in, and
 * the manifest carrying its packages where the toolchain needs one. Rust is the odd one — Cargo
 * insists on `src/main.rs`, while a solution with no crates is compiled straight from a file in
 * the working directory.
 *
 * Named here rather than only inside run-code so the editor can tell the reader what their code
 * is called on disk — which they need the moment a problem hands them a data file to open —
 * without the two drifting apart.
 */
export function solutionFiles(
	language: Language,
	packages: string[]
): { source: string; manifest?: string } {
	switch (language) {
		case 'python':
			return { source: 'main.py' };
		case 'typescript':
			return { source: 'main.ts', manifest: 'package.json' };
		case 'clojure':
			return { source: 'main.clj', manifest: 'deps.edn' };
		case 'rust':
			return packages.length > 0
				? { source: 'src/main.rs', manifest: 'Cargo.toml' }
				: { source: 'main.rs' };
		case 'cpp':
			return { source: 'main.cpp' };
		case 'assembly':
			return { source: 'main.s' };
	}
}
