<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	let {
		packages = $bindable<string[]>([]),
		onchange
	}: {
		packages?: string[];
		onchange?: (pkgs: string[]) => void;
	} = $props();

	let inputValue = $state('');

	function add() {
		const pkg = inputValue.trim();
		if (!pkg || packages.includes(pkg)) return;
		packages = [...packages, pkg];
		inputValue = '';
		onchange?.(packages);
	}

	function remove(pkg: string) {
		packages = packages.filter((p) => p !== pkg);
		onchange?.(packages);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			add();
		}
	}
</script>

<div class="flex flex-col gap-2 border-t border-border p-3">
	<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Packages</span>
	<div class="flex flex-wrap gap-1">
		{#each packages as pkg (pkg)}
			<Badge variant="secondary" class="gap-1 pr-1">
				{pkg}
				<button
					onclick={() => remove(pkg)}
					class="ml-0.5 rounded-sm opacity-60 hover:opacity-100"
					aria-label="Remove {pkg}"
				>
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</Badge>
		{/each}
	</div>
	<div class="flex gap-2">
		<Input
			bind:value={inputValue}
			{onkeydown}
			placeholder="numpy, requests..."
			class="h-7 text-xs"
		/>
		<Button onclick={add} size="sm" variant="outline" class="h-7 text-xs">Add</Button>
	</div>
</div>
