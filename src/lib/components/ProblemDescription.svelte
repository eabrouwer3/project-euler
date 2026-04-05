<script lang="ts">
	import renderMathInElement from 'katex/contrib/auto-render';
	import 'katex/dist/katex.min.css';

	let { html, width = 320 }: { html: string; width?: number } = $props();

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

<aside style="width: {width}px" class="flex h-full shrink-0 flex-col border-l border-border bg-card">
	<div class="border-b border-border px-4 py-3">
		<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Problem
		</span>
	</div>
	<div class="flex-1 overflow-y-auto">
		<div bind:this={container} class="problem-content p-4 text-sm leading-relaxed">
			{@html html}
		</div>
	</div>
</aside>

<style>
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
</style>
