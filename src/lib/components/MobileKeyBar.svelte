<script lang="ts">
	// The row of keys that sits between the editor and the on-screen keyboard. Nothing here is
	// reachable from a phone's default keyboard plane, and Tab is not reachable at all — which on
	// its own makes Python unwritable on a phone.
	import { indentLess, indentMore, redo, undo } from '@codemirror/commands';
	import { insertBracket } from '@codemirror/autocomplete';
	import { EditorView } from '@codemirror/view';
	import { MOBILE_KEYS } from '$lib/constants.js';
	import { keyboardInset } from '$lib/viewport.svelte.js';
	import type { Language } from '$lib/types.js';
	import { ChevronDown, Redo2, Undo2 } from '@lucide/svelte';

	let { view, language }: { view: EditorView | undefined; language: Language } = $props();

	const keys = $derived(MOBILE_KEYS[language]);

	const HEIGHT = 44;

	// The bar is out of flow, so the foot of the page would otherwise be unreachable underneath it.
	// The padding gives the document somewhere to scroll to; it is on `body` because that is what
	// scrolls once the mobile layout stops constraining its own height.
	$effect(() => {
		const clearance = HEIGHT + keyboardInset.current;
		document.body.style.paddingBottom = `${clearance}px`;
		return () => {
			document.body.style.paddingBottom = '';
		};
	});

	/**
	 * Touching a button would otherwise blur the editor, and a blurred editor on a phone means the
	 * keyboard slides away — so every key here acts on pointerdown and refuses the focus change
	 * that would normally follow.
	 */
	function press(e: PointerEvent, action: (v: EditorView) => void) {
		e.preventDefault();
		if (!view) return;
		action(view);
		view.focus();
	}

	function insert(v: EditorView, text: string) {
		// Routed through `insertBracket` so an opening bracket tapped here closes itself exactly as
		// it does when typed — closeBrackets watches input events, which a plain dispatch skips.
		const bracketed = insertBracket(v.state, text);
		v.dispatch(bracketed ?? v.state.replaceSelection(text));
	}
</script>

<!--
	Fixed to the viewport, lifted clear of the keyboard. It cannot sit in the document flow: the
	page scrolls on a phone now, and a bar in flow would scroll away from the keyboard it belongs to.
-->
<div
	class="fixed inset-x-0 z-40 flex items-stretch border-t border-border bg-card text-sm"
	style="bottom: {keyboardInset.current}px"
	role="toolbar"
	aria-label="Editor keys"
>
	<!--
		Indentation and history stay pinned; the symbols scroll between them. The pinned groups are
		kept to five keys total because they are charged against a 390px screen — every one of them
		is a symbol the reader cannot see without swiping.

		Cursor arrows are deliberately absent. They are what a Monaco-style editor needs, and the
		reason this editor does not is the same reason it is CodeMirror: on touch the selection
		handles and magnifier are the platform's, and they place a cursor better than an arrow key.
	-->
	<div class="flex shrink-0 items-stretch border-r border-border">
		<button
			class="flex h-11 w-9 items-center justify-center text-muted-foreground active:bg-accent"
			onpointerdown={(e) => press(e, indentMore)}
			aria-label="Indent"
		>
			<span class="font-mono text-base">⇥</span>
		</button>
		<button
			class="flex h-11 w-9 items-center justify-center text-muted-foreground active:bg-accent"
			onpointerdown={(e) => press(e, indentLess)}
			aria-label="Outdent"
		>
			<span class="font-mono text-base">⇤</span>
		</button>
	</div>

	<div class="flex flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
		{#each keys as key (key)}
			<button
				class="flex h-11 w-9 shrink-0 items-center justify-center font-mono text-base text-foreground active:bg-accent"
				onpointerdown={(e) => press(e, (v) => insert(v, key))}
				aria-label={key}
			>
				{key}
			</button>
		{/each}
	</div>

	<div class="flex shrink-0 items-stretch border-l border-border">
		<button
			class="flex h-11 w-9 items-center justify-center text-muted-foreground active:bg-accent"
			onpointerdown={(e) => press(e, undo)}
			aria-label="Undo"
		>
			<Undo2 size={16} />
		</button>
		<button
			class="flex h-11 w-9 items-center justify-center text-muted-foreground active:bg-accent"
			onpointerdown={(e) => press(e, redo)}
			aria-label="Redo"
		>
			<Redo2 size={16} />
		</button>
		<!-- Deliberately not a `press`: this one wants the blur, to put the keyboard away. -->
		<button
			class="flex h-11 w-9 items-center justify-center text-muted-foreground active:bg-accent"
			onclick={() => view?.contentDOM.blur()}
			aria-label="Hide keyboard"
		>
			<ChevronDown size={16} />
		</button>
	</div>
</div>
