<script lang="ts">
	import { page } from '$app/stores';
	import type { Problem } from '$lib/types.js';

	let { problems }: { problems: Problem[] } = $props();

	const currentId = $derived(Number($page.params.id));
	const currentLanguage = $derived($page.params.language ?? 'python');
</script>

<aside class="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
	<div class="border-b border-border px-4 py-3">
		<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Problems
		</span>
	</div>
	<nav class="flex-1 overflow-y-auto py-1">
		{#each problems as problem (problem.id)}
			<a
				href="/problem/{problem.id}/{currentLanguage}"
				class="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground
					{currentId === problem.id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground'}"
			>
				<span class="w-8 shrink-0 font-mono text-xs opacity-50">
					{String(problem.id).padStart(4, '0')}
				</span>
				<span class="truncate">{problem.title}</span>
			</a>
		{/each}
	</nav>
</aside>
