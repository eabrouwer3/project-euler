// CodeMirror grammar per language, loaded on demand so a Python solver never downloads the Rust
// or C++ parser. Assembly is the one that gained something in the move off Monaco, which ships no
// x86 grammar and left it as unhighlighted plaintext; `gas` here is the legacy GNU as mode built
// for x86, so `#` opens a line comment exactly as it does in the boilerplate.
import type { Extension } from '@codemirror/state';
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
			const [{ StreamLanguage }, { gas }] = await Promise.all([
				import('@codemirror/language'),
				import('@codemirror/legacy-modes/mode/gas')
			]);
			return StreamLanguage.define(gas);
		}
	}
}
