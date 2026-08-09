<script lang="ts">
	// CodeMirror 6 rather than Monaco, for the phone. Monaco implements text editing itself over a
	// hidden textarea, so on touch it loses the things the OS gives a `contenteditable` for free:
	// selection handles, the magnifier, IME that does not drop characters, momentum scrolling.
	// CodeMirror edits inside a real `contenteditable`, which is the whole reason it is here.
	import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
	import {
		EditorView,
		crosshairCursor,
		drawSelection,
		dropCursor,
		highlightActiveLine,
		highlightActiveLineGutter,
		highlightSpecialChars,
		keymap,
		lineNumbers,
		rectangularSelection
	} from '@codemirror/view';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import {
		autocompletion,
		closeBrackets,
		closeBracketsKeymap,
		completeAnyWord,
		completionKeymap
	} from '@codemirror/autocomplete';
	import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
	import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
	import { untrack } from 'svelte';
	import { mode } from 'mode-watcher';
	import { compact } from '$lib/compact.svelte.js';
	import { INDENT_WIDTH, languageExtension } from '$lib/editor/languages.js';
	import { autoHeight, editorTheme, fillHeight } from '$lib/editor/theme.js';
	import MobileKeyBar from './MobileKeyBar.svelte';
	import type { Language } from '$lib/types.js';

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
	let view = $state<EditorView | undefined>();
	let focused = $state(false);

	// Marks the transactions this component pushes in to match an external `code` change, so the
	// update listener can tell them apart from something the user typed and not echo them back out
	// as an edit worth autosaving.
	const External = Annotation.define<boolean>();

	const languageConf = new Compartment();
	const themeConf = new Compartment();
	const platformConf = new Compartment();

	/**
	 * The extensions that differ between a phone and a desktop.
	 *
	 * `drawSelection` is the significant one: it hides the native selection and paints its own,
	 * which is what makes multiple cursors visible — and which on touch takes away the handles and
	 * magnifier the platform would have drawn. Desktop keeps it, touch gets the browser's.
	 *
	 * Height is the other. A phone gets an editor as tall as its content, inside a page that
	 * scrolls; a desktop gets one that fills its pane and scrolls inside it. Long lines then scroll
	 * sideways rather than wrapping, which is only bearable because the editor no longer owns the
	 * vertical scroll it would be competing with.
	 */
	function platformExtensions(isCompact: boolean): Extension {
		return isCompact
			? [autoHeight]
			: [fillHeight, drawSelection(), rectangularSelection(), crosshairCursor()];
	}

	function baseExtensions(): Extension {
		return [
			lineNumbers(),
			highlightActiveLineGutter(),
			highlightSpecialChars(),
			history(),
			dropCursor(),
			EditorState.allowMultipleSelections.of(true),
			indentOnInput(),
			bracketMatching(),
			closeBrackets(),
			autocompletion(),
			highlightActiveLine(),
			highlightSelectionMatches(),
			// Completing words already in the document is worth far more on a phone than on a
			// desktop: it is the difference between typing an identifier once and typing it every
			// time. Registered as language data so it stacks with whatever the grammar offers
			// rather than replacing it.
			EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
			keymap.of([
				...closeBracketsKeymap,
				...defaultKeymap,
				...searchKeymap,
				...historyKeymap,
				...completionKeymap,
				indentWithTab
			]),
			EditorView.contentAttributes.of({
				// A phone keyboard will otherwise autocapitalise identifiers and "correct"
				// operators into prose.
				autocorrect: 'off',
				autocapitalize: 'off',
				spellcheck: 'false',
				translate: 'no'
			}),
			EditorView.updateListener.of((update) => {
				if (update.focusChanged) focused = update.view.hasFocus;
				if (!update.docChanged) return;
				if (update.transactions.some((tr) => tr.annotation(External))) return;
				const value = update.state.doc.toString();
				code = value;
				onchange?.(value);
			})
		];
	}

	// Build the editor once, then keep it: language, theme and platform all move through
	// compartments, so none of them needs the view torn down and rebuilt.
	//
	// `untrack` around the construction is what makes "once" true. `code`, `mode` and `compact` are
	// all read here to seed the initial state, and without it Svelte would treat them as
	// dependencies of this effect — so every keystroke would destroy the view and build a new one,
	// taking the focus, the selection and the undo history with it.
	$effect(() => {
		if (!container) return;
		const parent = container;

		const instance = untrack(
			() =>
				new EditorView({
					doc: code,
					extensions: [
						baseExtensions(),
						languageConf.of([]),
						themeConf.of(editorTheme(mode.current)),
						platformConf.of(platformExtensions(compact.current))
					],
					parent
				})
		);

		view = instance;

		return () => {
			instance.destroy();
			view = undefined;
		};
	});

	// Swap the grammar and indent width when the language changes. The load is async, so a stale
	// resolution is discarded rather than applied over a newer one.
	$effect(() => {
		const target = language;
		if (!view) return;
		let cancelled = false;

		languageExtension(target).then((support) => {
			if (cancelled || !view) return;
			view.dispatch({
				effects: languageConf.reconfigure([
					support,
					indentUnit.of(' '.repeat(INDENT_WIDTH[target]))
				])
			});
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		view?.dispatch({ effects: themeConf.reconfigure(editorTheme(mode.current)) });
	});

	$effect(() => {
		view?.dispatch({ effects: platformConf.reconfigure(platformExtensions(compact.current)) });
	});

	// Pull external `code` changes in — a language switch replaces the whole document.
	$effect(() => {
		const next = code;
		if (!view || view.state.doc.toString() === next) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: next },
			annotations: External.of(true)
		});
	});
</script>

<!--
	On a phone this wrapper is as tall as the editor inside it and the page scrolls; from `md` up it
	fills the pane it was given and the editor scrolls inside. The key bar is fixed to the viewport
	rather than sitting here in flow, so it is not affected either way.
-->
<div class="flex w-full flex-col md:h-full md:overflow-hidden">
	<div bind:this={container} class="md:min-h-0 md:flex-1 md:overflow-hidden"></div>
	{#if compact.current && focused}
		<MobileKeyBar {view} {language} />
	{/if}
</div>

<style>
	:global(.cm-editor .cm-scroller) {
		font-size: 14px;
	}

	/* 16px exactly, on a phone. Below it iOS treats a tap on an editable element as an invitation
	   to zoom the page in, and the editor is the one element on the page you tap the most. Stated
	   after the base rule, which it has to beat on source order — the two selectors carry the same
	   specificity. */
	@media (max-width: 767px) {
		:global(.cm-editor .cm-scroller) {
			font-size: 16px;
		}
	}

	:global(.cm-editor.cm-focused) {
		outline: none;
	}
</style>
