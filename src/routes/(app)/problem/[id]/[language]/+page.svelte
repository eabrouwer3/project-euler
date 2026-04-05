<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import LanguageSelector from '$lib/components/LanguageSelector.svelte';
	import PackageInput from '$lib/components/PackageInput.svelte';
	import ProblemDescription from '$lib/components/ProblemDescription.svelte';
	import RunOutput from '$lib/components/RunOutput.svelte';
	import type { Language } from '$lib/types.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let code = $state(data.code);
	let packages = $state(data.packages);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveStatus = $state<'saved' | 'saving' | ''>('');

	// Reset local state when navigating to a different problem/language
	$effect(() => {
		code = data.code;
		packages = data.packages;
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
		} catch {
			saveStatus = '';
		}
	}

	async function runSolution() {
		const res = await fetch('/api/run', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				problemId: data.problemId,
				language: data.language,
				code,
				packages
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
			{/if}
		</div>

		<!-- Monaco editor -->
		<div class="flex-1 overflow-hidden">
			<CodeEditor bind:code language={data.language} onchange={(val) => scheduleAutosave(val)} />
		</div>

		<!-- Bottom panels -->
		<div class="shrink-0 border-t border-border">
			<PackageInput bind:packages onchange={(pkgs) => scheduleAutosave(code, pkgs)} />
			<RunOutput onrun={runSolution} />
		</div>
	</div>

	<!-- Problem description -->
	<ProblemDescription html={data.problemHtml} />
</div>
