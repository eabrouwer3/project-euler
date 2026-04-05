<script lang="ts">
	import { page } from '$app/stores';
	import { signOut } from '@auth/sveltekit/client';
	import ProblemSidebar from '$lib/components/ProblemSidebar.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu/index.js';
	import type { LayoutData } from './$types.js';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<div class="flex h-screen flex-col overflow-hidden">
	<!-- Top nav -->
	<header class="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
		<a href="/problem/1" class="text-sm font-semibold tracking-tight">Project Euler Portal</a>

		<div>
			{#if data.session?.user}
				<DropdownMenu>
					<DropdownMenuTrigger>
						<button class="flex items-center gap-2 rounded-full">
							{#if data.session.user.image}
								<img
									src={data.session.user.image}
									alt={data.session.user.name}
									class="h-7 w-7 rounded-full"
								/>
							{/if}
							<span class="text-sm text-muted-foreground">{data.session.user.name}</span>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onclick={() => signOut({ redirectTo: '/login' })}>
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			{:else if $page.url.pathname !== '/login'}
				<Button variant="outline" size="sm" href="/login">Sign in</Button>
			{/if}
		</div>
	</header>

	<!-- Body: sidebar + main -->
	<div class="flex flex-1 overflow-hidden">
		<ProblemSidebar problems={data.problems} />
		<main class="flex flex-1 overflow-hidden">
			{@render children()}
		</main>
	</div>
</div>
