<script lang="ts">
	import { goto, invalidate, afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import PackageInput from '$lib/components/PackageInput.svelte';
	import ProblemDescription from '$lib/components/ProblemDescription.svelte';
	import RunOutput from '$lib/components/RunOutput.svelte';
	import { SUPPORTS_PACKAGES } from '$lib/constants.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { BookOpen } from '@lucide/svelte';
	import type { Language, SolutionStatus } from '$lib/types.js';
	import type { PageData } from './$types.js';

	// Green treatment layered over the outline variant, which otherwise wins on hover/dark
	const SOLVED_BUTTON =
		'border-green-500/40 bg-green-500/10 text-green-600 hover:bg-green-500/20 hover:text-green-600 ' +
		'dark:border-green-500/40 dark:bg-green-500/15 dark:text-green-400 dark:hover:bg-green-500/25 dark:hover:text-green-400';

	let { data }: { data: PageData } = $props();

	let code = $state(data.code);
	let packages = $state(data.packages);
	let status = $state(data.status);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveStatus = $state<'saved' | 'saving' | ''>('');
	let problemWidth = $state(browser ? (Number(localStorage.getItem('problem-width')) || 320) : 320);
	let outputHeight = $state(browser ? (Number(localStorage.getItem('output-height')) || 220) : 220);

	// Off-canvas problem description, only meaningful below the `md` breakpoint
	let problemOpen = $state(false);

	$effect(() => { localStorage.setItem('problem-width', String(problemWidth)); });
	$effect(() => { localStorage.setItem('output-height', String(outputHeight)); });

	function startProblemResize(e: MouseEvent) {
		const startX = e.clientX;
		const startWidth = problemWidth;
		document.body.style.userSelect = 'none';
		const onMove = (e: MouseEvent) => {
			problemWidth = Math.max(200, Math.min(600, startWidth - (e.clientX - startX)));
		};
		const onUp = () => {
			document.body.style.userSelect = '';
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function startOutputResize(e: MouseEvent) {
		const startY = e.clientY;
		const startHeight = outputHeight;
		document.body.style.userSelect = 'none';
		const onMove = (e: MouseEvent) => {
			outputHeight = Math.max(80, Math.min(600, startHeight - (e.clientY - startY)));
		};
		const onUp = () => {
			document.body.style.userSelect = '';
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	// Reset local state when navigating to a different problem/language
	afterNavigate(() => {
		code = data.code;
		packages = data.packages;
		status = data.status;
		problemOpen = false;
	});

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') problemOpen = false;
	}

	function onLanguageChange(lang: Language) {
		goto(`/problem/${data.problemId}/${lang}`);
	}

	function scheduleAutosave(newCode: string, newPackages?: string[]) {
		if (!$page.data.session?.user) return;
		clearTimeout(saveTimer);
		saveStatus = 'saving';
		saveTimer = setTimeout(() => save(newCode, newPackages ?? packages), 1000);
	}

	async function save(currentCode: string, currentPackages: string[]) {
		try {
			await fetch('/api/solutions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					problemId: data.problemId,
					language: data.language,
					code: currentCode,
					packages: currentPackages
				})
			});
			saveStatus = 'saved';
			setTimeout(() => (saveStatus = ''), 2000);
			invalidate('app:solutions');
		} catch {
			saveStatus = '';
		}
	}

	async function toggleStatus() {
		const newStatus: SolutionStatus = status === 'solved' ? 'in_progress' : 'solved';
		await fetch('/api/solutions', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ problemId: data.problemId, language: data.language, status: newStatus })
		});
		status = newStatus;
		invalidate('app:solutions');
	}

	async function runSolution() {
		const res = await fetch('/api/run', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				problemId: data.problemId,
				language: data.language
			})
		});
		if (!res.ok) throw new Error(`Server error: ${res.status}`);
		return res.json() as Promise<{ stdout: string; stderr: string }>;
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="relative flex flex-1 overflow-hidden">
	<!-- Editor panel -->
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<!-- Toolbar -->
		<div class="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3 md:gap-3">
			<LanguageSelector value={data.language} onchange={onLanguageChange} />
			{#if saveStatus === 'saving'}
				<span class="text-xs text-muted-foreground">Saving…</span>
			{:else if saveStatus === 'saved'}
				<span class="text-xs text-green-500">Saved</span>
			{/if}
			{#if !$page.data.session?.user}
				<span class="ml-auto whitespace-nowrap text-xs text-muted-foreground">
					<a href="/login" class="underline">Sign in</a><span class="hidden sm:inline">
						to save progress</span>
				</span>
			{:else}
				<Button
					onclick={toggleStatus}
					variant="outline"
					size="sm"
					class="ml-auto h-7 text-xs {status === 'solved' ? SOLVED_BUTTON : ''}"
				>
					{status === 'solved' ? '✓ Solved' : 'Mark solved'}
				</Button>
			{/if}

			<!-- Mobile: slide the problem description out from the right -->
			<Button
				onclick={() => (problemOpen = !problemOpen)}
				variant="outline"
				size="sm"
				class="h-7 text-xs md:hidden"
				aria-expanded={problemOpen}
			>
				<BookOpen size={14} />
				Problem
			</Button>
		</div>

		<!-- Monaco editor -->
		<div class="flex-1 overflow-hidden">
			<CodeEditor bind:code language={data.language} onchange={(val) => scheduleAutosave(val)} />
		</div>

		<!-- Bottom panels: stacked under the editor at every size -->
		<div
			style="--output-height: {outputHeight}px"
			class="flex h-2/5 shrink-0 flex-col border-t border-border md:h-[var(--output-height)]"
		>
			<div
				class="hidden h-1 shrink-0 cursor-row-resize transition-colors hover:bg-primary/30 md:block"
				onmousedown={startOutputResize}
				role="separator"
				aria-label="Resize output panel"
			></div>
			{#if SUPPORTS_PACKAGES[data.language]}
				<PackageInput bind:packages onchange={(pkgs) => scheduleAutosave(code, pkgs)} />
			{/if}
			<RunOutput onrun={runSolution} disabled={saveStatus === 'saving'} />
		</div>
	</div>

	<!-- Mobile backdrop for the problem drawer -->
	{#if problemOpen}
		<button
			onclick={() => (problemOpen = false)}
			class="absolute inset-0 z-20 bg-black/50 md:hidden"
			aria-label="Hide problem"
			tabindex="-1"
		></button>
	{/if}

	<!-- Resize handle -->
	<div
		class="hidden w-1 shrink-0 cursor-col-resize transition-colors hover:bg-primary/30 md:block"
		onmousedown={startProblemResize}
		role="separator"
		aria-label="Resize problem panel"
	></div>

	<!-- Problem description. Below `md` it slides in from the right. -->
	<div
		style="--problem-width: {problemWidth}px"
		class="absolute inset-y-0 right-0 z-30 flex w-[85%] max-w-sm shrink-0 transition-transform duration-200 ease-out shadow-xl md:shadow-none
			md:static md:z-auto md:w-[var(--problem-width)] md:max-w-none md:translate-x-0 md:transition-none
			{problemOpen ? 'translate-x-0' : 'translate-x-full'}"
	>
		<ProblemDescription html={data.problemHtml} onclose={() => (problemOpen = false)} />
	</div>
</div>
