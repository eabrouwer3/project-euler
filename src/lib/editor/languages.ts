// CodeMirror grammar per language, loaded on demand so a Python solver never downloads the Rust
// or C++ parser. Assembly is the one that gained something in the move off Monaco, which ships no
// assembler grammar at all and left it as unhighlighted plaintext; `gasArm` here is the legacy
// GNU as mode, adapted below to the AArch64 dialect the runner assembles.
import type { Extension } from '@codemirror/state';
import type { StreamParser } from '@codemirror/language';
import type { Language } from '$lib/types.js';

/**
 * Columns one indent step moves by, matching what each language's boilerplate already uses so the
 * key bar's indent button does not fight the code it lands in. Assembly is the outlier: its
 * boilerplate lays instructions out in 8-column fields.
 */
export const INDENT_WIDTH: Record<Language, number> = {
	python: 4,
	typescript: 2,
	clojure: 2,
	rust: 4,
	cpp: 4,
	assembly: 8
};

/** x0-x30 and their 32-bit w halves, plus the registers that go by name instead of number. */
const AARCH64_REGISTER = /^(?:[xw](?:[12]?\d|30|zr)|sp|lr|fp|pc)$/;

/**
 * AArch64 out of the legacy gas mode, which ships two dialects and neither of them is this one.
 *
 * `gas` is x86 and now actively wrong: it opens a line comment at `#`, which on AArch64 is the
 * immediate prefix, so every `mov x0, #1` would grey out the rest of its own line. `gasArm` is
 * 32-bit ARMv6 — a comment character AArch64 never writes, and the r0-r15 file that x0-x30
 * replaced — but being wrong about what it highlights beats being wrong about what it hides, so
 * that is the base, with the two things AArch64 spells differently patched over it.
 *
 * The `//` rule runs ahead of the base and so also fires inside a block comment, where the base
 * would have called those two characters a comment anyway. It cannot fire inside a string: the
 * base consumes a string whole, and never leaves the stream standing in the middle of one.
 */
function aarch64(base: StreamParser<unknown>): StreamParser<unknown> {
	return {
		...base,
		token(stream, state) {
			if (stream.match('//')) {
				stream.skipToEnd();
				return 'comment';
			}

			const from = stream.pos;
			const style = base.token(stream, state);
			if (style) return style;

			// The base already ate the word and declined to name it; this only asks whether what
			// it ate was a register the ARMv6 table has never heard of.
			const word = stream.string.slice(from, stream.pos).toLowerCase();
			return AARCH64_REGISTER.test(word) ? 'variable' : style;
		},
		languageData: {
			...base.languageData,
			// Otherwise toggle-comment inserts ARMv6's `@`, which this assembler rejects.
			commentTokens: { line: '//', block: { open: '/*', close: '*/' } }
		}
	};
}

export async function languageExtension(language: Language): Promise<Extension> {
	switch (language) {
		case 'python': {
			const { python } = await import('@codemirror/lang-python');
			return python();
		}
		case 'typescript': {
			const { javascript } = await import('@codemirror/lang-javascript');
			return javascript({ typescript: true });
		}
		case 'rust': {
			const { rust } = await import('@codemirror/lang-rust');
			return rust();
		}
		case 'cpp': {
			const { cpp } = await import('@codemirror/lang-cpp');
			return cpp();
		}
		case 'clojure': {
			const [{ StreamLanguage }, { clojure }] = await Promise.all([
				import('@codemirror/language'),
				import('@codemirror/legacy-modes/mode/clojure')
			]);
			return StreamLanguage.define(clojure);
		}
		case 'assembly': {
			const [{ StreamLanguage }, { gasArm }] = await Promise.all([
				import('@codemirror/language'),
				import('@codemirror/legacy-modes/mode/gas')
			]);
			return StreamLanguage.define(aarch64(gasArm));
		}
	}
}
