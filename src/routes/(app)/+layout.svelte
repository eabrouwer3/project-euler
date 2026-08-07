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
	import { Menu, Moon, Sun } from '@lucide/svelte';
	import { toggleMode, mode } from 'mode-watcher';
	import { browser } from '$app/environment';
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import type { LayoutData } from './$types.js';

	let importInput: HTMLInputElement;

	async function handleImport(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const formData = new FormData();
		formData.append('file', file);
		const res = await fetch('/api/solutions/import', { method: 'POST', body: formData });
		if (res.ok) {
			const { imported } = await res.json();
			alert(`Imported ${imported} solutions.`);
			await invalidateAll();
		} else {
			alert('Import failed.');
		}
		importInput.value = '';
	}

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let sidebarWidth = $state(browser ? (Number(localStorage.getItem('sidebar-width')) || 256) : 256);

	// Off-canvas sidebar state, only meaningful below the `md` breakpoint
	let sidebarOpen = $state(false);

	$effect(() => { localStorage.setItem('sidebar-width', String(sidebarWidth)); });

	// Picking a problem should close the drawer on mobile
	afterNavigate(() => { sidebarOpen = false; });

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') sidebarOpen = false;
	}

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

<svelte:window onkeydown={onWindowKeydown} />

<div class="flex h-dvh flex-col overflow-hidden">
	<!-- Top nav -->
	<header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 md:px-4">
		<div class="flex min-w-0 items-center gap-2">
			<button
				onclick={() => (sidebarOpen = !sidebarOpen)}
				class="-ml-1 rounded p-1 text-muted-foreground hover:text-foreground md:hidden"
				aria-label="Toggle problem list"
				aria-expanded={sidebarOpen}
			>
				<Menu size={18} />
			</button>
			<a href="/problem/1" class="truncate text-sm font-semibold tracking-tight">Project Euler Portal</a>
		</div>

		<div class="flex shrink-0 items-center gap-2">
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
							<span class="hidden text-sm text-muted-foreground sm:inline">
								{data.session.user.name}
							</span>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem>
							<a href="/api/solutions/export" download="euler-solutions.zip" class="w-full">
								Export solutions
							</a>
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => importInput.click()}>
							Import solutions
						</DropdownMenuItem>
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

	<input bind:this={importInput} type="file" accept=".zip" class="hidden" onchange={handleImport} />

	<!-- Body: sidebar + main. Below `md` the sidebar is an off-canvas drawer. -->
	<div class="relative flex flex-1 overflow-hidden">
		{#if sidebarOpen}
			<button
				onclick={() => (sidebarOpen = false)}
				class="absolute inset-0 z-20 bg-black/50 md:hidden"
				aria-label="Close problem list"
				tabindex="-1"
			></button>
		{/if}

		<div
			style="--sidebar-width: {sidebarWidth}px"
			class="absolute inset-y-0 left-0 z-30 flex w-72 max-w-[85%] shrink-0 transition-transform duration-200 ease-out shadow-xl md:shadow-none
				md:static md:z-auto md:w-[var(--sidebar-width)] md:max-w-none md:translate-x-0 md:transition-none
				{sidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
		>
			<ProblemSidebar problems={data.problems} solutionSummaries={data.solutionSummaries} />
		</div>

		<div
			class="hidden w-1 shrink-0 cursor-col-resize transition-colors hover:bg-primary/30 md:block"
			onmousedown={startSidebarResize}
			role="separator"
			aria-label="Resize sidebar"
		></div>
		<main class="flex flex-1 overflow-hidden">
			{@render children()}
		</main>
	</div>
</div>
