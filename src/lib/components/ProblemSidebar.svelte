<script lang="ts">
	import { page } from '$app/stores';
	import { LANGUAGE_ABBR } from '$lib/constants.js';
	import type { Problem, SolutionSummary } from '$lib/types.js';

	type FilterOption = 'all' | 'not_started' | 'in_progress' | 'solved';

	let {
		problems,
		solutionSummaries = [],
		width = 256
	}: { problems: Problem[]; solutionSummaries: SolutionSummary[]; width?: number } = $props();

	let filter = $state<FilterOption>('all');

	const currentId = $derived(Number($page.params.id));
	const currentLanguage = $derived($page.params.language ?? 'python');

	const summaryMap = $derived(
		solutionSummaries.reduce((map, s) => {
			const arr = map.get(s.problemId) ?? [];
			arr.push(s);
			map.set(s.problemId, arr);
			return map;
		}, new Map<number, SolutionSummary[]>())
	);

	const filteredProblems = $derived(
		filter === 'all'
			? problems
			: problems.filter((p) => {
					const entries = summaryMap.get(p.id) ?? [];
					if (filter === 'not_started') return entries.length === 0;
					if (filter === 'in_progress') return entries.some((s) => s.status === 'in_progress');
					if (filter === 'solved') return entries.some((s) => s.status === 'solved');
					return true;
				})
	);

	const filters: { value: FilterOption; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'not_started', label: 'New' },
		{ value: 'in_progress', label: 'Started' },
		{ value: 'solved', label: 'Solved' }
	];
</script>

<aside style="width: {width}px" class="flex h-full shrink-0 flex-col border-r border-border bg-card">
	<div class="border-b border-border px-4 py-3">
		<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Problems
		</span>
		<div class="mt-2 flex gap-1">
			{#each filters as f (f.value)}
				<button
					onclick={() => (filter = f.value)}
					class="rounded px-2 py-0.5 text-xs transition-colors
						{filter === f.value
						? 'bg-accent font-medium text-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{f.label}
				</button>
			{/each}
		</div>
	</div>
	<nav class="flex-1 overflow-y-auto py-1">
		{#each filteredProblems as problem (problem.id)}
			{@const chips = summaryMap.get(problem.id) ?? []}
			<a
				href="/problem/{problem.id}/{currentLanguage}"
				class="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground
					{currentId === problem.id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground'}"
			>
				<span class="w-8 shrink-0 font-mono text-xs opacity-50">
					{String(problem.id).padStart(4, '0')}
				</span>
				<span class="truncate">{problem.title}</span>
				{#if chips.length > 0}
					<span class="ml-auto flex shrink-0 gap-1">
						{#each chips as chip (chip.language)}
							<span
								class="rounded px-1 py-0.5 font-mono text-[10px] leading-none
									{chip.status === 'solved'
									? 'bg-green-500/20 text-green-600 dark:text-green-400'
									: 'bg-blue-500/20 text-blue-500 dark:text-blue-400'}"
							>
								{LANGUAGE_ABBR[chip.language]}
							</span>
						{/each}
					</span>
				{/if}
			</a>
		{/each}
	</nav>
</aside>
