<script lang="ts">
	import loader from '@monaco-editor/loader';
	import { MONACO_LANGUAGE } from '$lib/constants.js';
	import type { Language } from '$lib/types.js';
	import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

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

	// Initialize editor once
	$effect(() => {
		if (!container) return;

		let disposed = false;

		loader.init().then((m) => {
			if (disposed) return;
			monaco = m;

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
				theme: 'vs-dark',
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
