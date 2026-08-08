<script lang="ts">
	import renderMathInElement from 'katex/contrib/auto-render';
	import 'katex/dist/katex.min.css';
	import { X } from '@lucide/svelte';

	let { html, onclose }: { html: string; onclose?: () => void } = $props();

	let container: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!container || !html) return;
		renderMathInElement(container, {
			delimiters: [
				{ left: '$$', right: '$$', display: true },
				{ left: '\\[', right: '\\]', display: true },
				{ left: '$', right: '$', display: false },
				{ left: '\\(', right: '\\)', display: false }
			],
			throwOnError: false
		});
	});
</script>

<aside class="flex h-full w-full flex-col border-l border-border bg-card">
	<div class="flex items-center justify-between border-b border-border px-4 py-3">
		<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Problem
		</span>
		{#if onclose}
			<button
				onclick={onclose}
				class="-mr-1 rounded p-1 text-muted-foreground hover:text-foreground md:hidden"
				aria-label="Hide problem"
			>
				<X size={16} />
			</button>
		{/if}
	</div>
	<div class="flex-1 overflow-auto">
		<div bind:this={container} class="problem-content p-4 text-sm leading-relaxed">
			{@html html}
		</div>
	</div>
</aside>

<style>
	.problem-content {
		overflow-wrap: break-word;
	}
	.problem-content :global(p) {
		margin-bottom: 0.75rem;
	}
	.problem-content :global(b),
	.problem-content :global(strong) {
		font-weight: 600;
	}
	.problem-content :global(i),
	.problem-content :global(em) {
		font-style: italic;
	}
	.problem-content :global(table) {
		border-collapse: collapse;
		margin-bottom: 0.75rem;
	}
	.problem-content :global(td),
	.problem-content :global(th) {
		padding: 2px 8px;
		border: 1px solid hsl(var(--border));
	}
	.problem-content :global(img) {
		max-width: 100%;
		height: auto;
		margin: 0.5rem 0;
	}
	/**
	 * Project Euler's diagrams are black line art on a transparent background, so on a dark page
	 * they are invisible rather than merely low-contrast — problem 15's grid disappeared entirely.
	 * The site itself plates them white in its dark theme (that is what the `dark_img` class on
	 * them means), so do the same rather than inverting: an invert would wreck the diagrams that
	 * do carry colour.
	 */
	:global(.dark) .problem-content :global(img) {
		background-color: #fff;
		padding: 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
	}
	.problem-content :global(blockquote) {
		border-left: 3px solid hsl(var(--border));
		padding-left: 1rem;
		margin: 0.75rem 0;
		color: hsl(var(--muted-foreground));
	}
	.problem-content :global(.monospace) {
		font-family: monospace;
	}
	.problem-content :global(.center) {
		text-align: center;
	}
	.problem-content :global(.red) {
		color: #ff0000;
	}
</style>
