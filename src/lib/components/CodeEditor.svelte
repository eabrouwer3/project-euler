<script lang="ts">
	import loader from '@monaco-editor/loader';
	import { MONACO_LANGUAGE } from '$lib/constants.js';
	import type { Language } from '$lib/types.js';
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
	import { mode } from 'mode-watcher';

	let {
		code = $bindable(''),
		language,
		onchange
	}: {
		code?: string;
		language: Language;
		onchange?: (value: string) => void;
	} = $props();

	let container: HTMLDivElement | undefined = $state();
	let editor = $state<Monaco.editor.IStandaloneCodeEditor | undefined>();
	let monaco: typeof Monaco | undefined;
	let ignoreNextChange = false;

	function defineAtomThemes(m: typeof Monaco) {
		m.editor.defineTheme('atom-one-dark', {
			base: 'vs-dark',
			inherit: true,
			rules: [
				{ token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
				{ token: 'keyword', foreground: 'c678dd' },
				{ token: 'string', foreground: '98c379' },
				{ token: 'string.escape', foreground: '56b6c2' },
				{ token: 'number', foreground: 'd19a66' },
				{ token: 'regexp', foreground: '98c379' },
				{ token: 'operator', foreground: '56b6c2' },
				{ token: 'type', foreground: 'e5c07b' },
				{ token: 'class', foreground: 'e5c07b' },
				{ token: 'function', foreground: '61afef' },
				{ token: 'variable.predefined', foreground: 'e06c75' }
			],
			colors: {
				'editor.background': '#282c34',
				'editor.foreground': '#abb2bf',
				'editor.lineHighlightBackground': '#2c313c',
				'editor.selectionBackground': '#3e4451',
				'editorCursor.foreground': '#528bff',
				'editorLineNumber.foreground': '#4b5263',
				'editorLineNumber.activeForeground': '#abb2bf'
			}
		});

		m.editor.defineTheme('atom-one-light', {
			base: 'vs',
			inherit: true,
			rules: [
				{ token: 'comment', foreground: 'a0a1a7', fontStyle: 'italic' },
				{ token: 'keyword', foreground: 'a626a4' },
				{ token: 'string', foreground: '50a14f' },
				{ token: 'string.escape', foreground: '0184bc' },
				{ token: 'number', foreground: '986801' },
				{ token: 'regexp', foreground: '50a14f' },
				{ token: 'operator', foreground: '0184bc' },
				{ token: 'type', foreground: 'c18401' },
				{ token: 'class', foreground: 'c18401' },
				{ token: 'function', foreground: '4078f2' },
				{ token: 'variable.predefined', foreground: 'e45649' }
			],
			colors: {
				'editor.background': '#fafafa',
				'editor.foreground': '#383a42',
				'editor.lineHighlightBackground': '#f0f0f0',
				'editor.selectionBackground': '#d0d0d0',
				'editorCursor.foreground': '#526fff',
				'editorLineNumber.foreground': '#9d9d9f',
				'editorLineNumber.activeForeground': '#383a42'
			}
		});
	}

	// Initialize editor once
	$effect(() => {
		if (!container) return;

		let disposed = false;

		loader.init().then((m) => {
			if (disposed) return;
			monaco = m;

			defineAtomThemes(m);

			// Configure TypeScript for Deno-style ESNext modules
			monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
				target: monaco.languages.typescript.ScriptTarget.ESNext,
				module: monaco.languages.typescript.ModuleKind.ESNext,
				moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
				strict: true
			});

			const instance = monaco.editor.create(container!, {
				value: code,
				language: MONACO_LANGUAGE[language],
				theme: mode.current === 'dark' ? 'atom-one-dark' : 'atom-one-light',
				fontSize: 14,
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				automaticLayout: true,
				padding: { top: 12, bottom: 12 }
			});

			instance.onDidChangeModelContent(() => {
				if (ignoreNextChange) {
					ignoreNextChange = false;
					return;
				}
				const val = instance.getValue();
				code = val;
				onchange?.(val);
			});

			editor = instance;
		});

		return () => {
			disposed = true;
			editor?.dispose();
			editor = undefined;
		};
	});

	// Sync language changes
	$effect(() => {
		if (!editor || !monaco) return;
		const model = editor.getModel();
		if (model) monaco.editor.setModelLanguage(model, MONACO_LANGUAGE[language]);
	});

	// Sync theme when color mode changes
	$effect(() => {
		if (!editor || !monaco) return;
		monaco.editor.setTheme(mode.current === 'dark' ? 'atom-one-dark' : 'atom-one-light');
	});

	// Sync external code changes (e.g. language switch) into the editor
	$effect(() => {
		if (!editor) return;
		if (editor.getValue() !== code) {
			ignoreNextChange = true;
			editor.setValue(code);
		}
	});
</script>

<div bind:this={container} class="h-full w-full"></div>
