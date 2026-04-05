import type { Language } from './types.js';

export const LANGUAGES: Language[] = ['python', 'typescript', 'clojure'];

export const BOILERPLATE: Record<Language, string> = {
	python: `if __name__ == '__main__':
    print('Hello, World!')
`,
	typescript: `if (import.meta.main) {
  console.log('Hello, World!')
}
`,
	clojure: `(println "Hello, World!")`
};

export const LANGUAGE_LABELS: Record<Language, string> = {
	python: 'Python 3.12',
	typescript: 'TypeScript (Deno 2)',
	clojure: 'Clojure 1.12'
};

export const LANGUAGE_ABBR: Record<Language, string> = {
	python: 'PY',
	typescript: 'TS',
	clojure: 'CLJ'
};

export const MONACO_LANGUAGE: Record<Language, string> = {
	python: 'python',
	typescript: 'typescript',
	clojure: 'clojure'
};
