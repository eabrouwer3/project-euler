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
	assembly: `        .section .rodata
msg:    .ascii  "Hello, World!\\n"
        .set    msglen, . - msg

        .section .text
        .globl  _start
_start:
        movq    $1, %rax                # write
        movq    $1, %rdi                # stdout
        leaq    msg(%rip), %rsi
        movq    $msglen, %rdx
        syscall

        movq    $60, %rax               # exit
        xorq    %rdi, %rdi
        syscall
`
};

export const LANGUAGE_LABELS: Record<Language, string> = {
	python: 'Python 3.13',
	typescript: 'TypeScript (Bun 1)',
	clojure: 'Clojure 1.12 (Java 21)',
	rust: 'Rust (stable)',
	cpp: 'C++26 (GCC 16)',
	assembly: 'x86-64 Assembly (GNU as)'
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

/** Monaco ships no x86 assembly grammar (only MIPS), so assembly falls back to unhighlighted text. */
export const MONACO_LANGUAGE: Record<Language, string> = {
	python: 'python',
	typescript: 'typescript',
	clojure: 'clojure',
	rust: 'rust',
	cpp: 'cpp',
	assembly: 'plaintext'
};
