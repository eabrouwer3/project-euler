<script lang="ts">
	import { goto, invalidate, afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import PackageInput from '$lib/components/PackageInput.svelte';
	import ProblemDescription from '$lib/components/ProblemDescription.svelte';
	import RunOutput from '$lib/components/RunOutput.svelte';
	import type { Language, SolutionStatus } from '$lib/types.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let code = $state(data.code);
	let packages = $state(data.packages);
	let status = $state(data.status);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveStatus = $state<'saved' | 'saving' | ''>('');
	let problemWidth = $state(browser ? (Number(localStorage.getItem('problem-width')) || 320) : 320);
	let outputHeight = $state(browser ? (Number(localStorage.getItem('output-height')) || 220) : 220);

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
	});

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

<div class="flex flex-1 overflow-hidden">
	<!-- Editor panel -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Toolbar -->
		<div class="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
			<LanguageSelector value={data.language} onchange={onLanguageChange} />
			{#if saveStatus === 'saving'}
				<span class="text-xs text-muted-foreground">Saving…</span>
			{:else if saveStatus === 'saved'}
				<span class="text-xs text-green-500">Saved</span>
			{/if}
			{#if !$page.data.session?.user}
				<span class="ml-auto text-xs text-muted-foreground">
					<a href="/login" class="underline">Sign in</a> to save progress
				</span>
			{:else}
				<button
					onclick={toggleStatus}
					class="ml-auto rounded px-2 py-1 text-xs transition-colors
						{status === 'solved'
						? 'bg-green-500/20 text-green-600 hover:bg-green-500/30 dark:text-green-400'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{status === 'solved' ? '✓ Solved' : 'Mark solved'}
				</button>
			{/if}
		</div>

		<!-- Monaco editor -->
		<div class="flex-1 overflow-hidden">
			<CodeEditor bind:code language={data.language} onchange={(val) => scheduleAutosave(val)} />
		</div>

		<!-- Bottom panels -->
		<div style="height: {outputHeight}px" class="flex shrink-0 flex-col border-t border-border">
			<div
				class="h-1 shrink-0 cursor-row-resize transition-colors hover:bg-primary/30"
				onmousedown={startOutputResize}
				role="separator"
				aria-label="Resize output panel"
			></div>
			<PackageInput bind:packages onchange={(pkgs) => scheduleAutosave(code, pkgs)} />
			<RunOutput onrun={runSolution} disabled={saveStatus === 'saving'} />
		</div>
	</div>

	<!-- Resize handle -->
	<div
		class="w-1 shrink-0 cursor-col-resize transition-colors hover:bg-primary/30"
		onmousedown={startProblemResize}
		role="separator"
		aria-label="Resize problem panel"
	></div>

	<!-- Problem description -->
	<ProblemDescription html={data.problemHtml} width={problemWidth} />
</div>
