<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		onrun,
		disabled = false
	}: {
		onrun: () => Promise<{ stdout: string; stderr: string }>;
		disabled?: boolean;
	} = $props();

	let running = $state(false);
	let stdout = $state('');
	let stderr = $state('');
	let error = $state('');

	async function run() {
		running = true;
		stdout = '';
		stderr = '';
		error = '';
		try {
			const result = await onrun();
			stdout = result.stdout;
			stderr = result.stderr;
		} catch (e) {
			error = String(e);
		} finally {
			running = false;
		}
	}

	const hasOutput = $derived(stdout || stderr || error);
</script>

<div class="flex flex-1 flex-col gap-2 overflow-hidden border-t border-border p-3">
	<div class="flex shrink-0 items-center justify-between">
		<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</span>
		<Button onclick={run} disabled={running || disabled} size="sm" class="h-7 text-xs">
			{#if running}
				<svg class="mr-1.5 h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
				Running...
			{:else}
				▶ Run
			{/if}
		</Button>
	</div>

	{#if hasOutput}
		<div class="flex-1 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-xs">
			{#if stdout}
				<pre class="whitespace-pre-wrap text-green-400">{stdout}</pre>
			{/if}
			{#if stderr}
				<pre class="whitespace-pre-wrap text-red-400">{stderr}</pre>
			{/if}
			{#if error}
				<pre class="whitespace-pre-wrap text-red-400">{error}</pre>
			{/if}
		</div>
	{:else if !running}
		<p class="text-xs text-muted-foreground">Click Run to execute your solution.</p>
	{/if}
</div>
