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
	import { Moon, Sun } from '@lucide/svelte';
	import { toggleMode, mode } from 'mode-watcher';
	import type { LayoutData } from './$types.js';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let sidebarWidth = $state(256);

	function startSidebarResize(e: MouseEvent) {
		const startX = e.clientX;
		const startWidth = sidebarWidth;
		document.body.style.userSelect = 'none';
		const onMove = (e: MouseEvent) => {
			sidebarWidth = Math.max(140, Math.min(400, startWidth + e.clientX - startX));
		};
		const onUp = () => {
			document.body.style.userSelect = '';
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}
</script>

<div class="flex h-screen flex-col overflow-hidden">
	<!-- Top nav -->
	<header class="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
		<a href="/problem/1" class="text-sm font-semibold tracking-tight">Project Euler Portal</a>

		<div class="flex items-center gap-2">
			<button onclick={toggleMode} class="text-muted-foreground hover:text-foreground" aria-label="Toggle theme">
				{#if mode.current === 'dark'}
					<Sun size={16} />
				{:else}
					<Moon size={16} />
				{/if}
			</button>

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
		<ProblemSidebar problems={data.problems} solutionSummaries={data.solutionSummaries} width={sidebarWidth} />
		<div
			class="w-1 shrink-0 cursor-col-resize transition-colors hover:bg-primary/30"
			onmousedown={startSidebarResize}
			role="separator"
			aria-label="Resize sidebar"
		></div>
		<main class="flex flex-1 overflow-hidden">
			{@render children()}
		</main>
	</div>
</div>
