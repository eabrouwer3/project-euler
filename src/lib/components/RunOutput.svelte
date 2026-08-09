<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import type { RunEvent } from '$lib/types.js';

	let {
		onrun,
		disabled = false,
		collapsed = false
	}: {
		/** Starts a run and reports it as it happens; resolves when the run is over. */
		onrun: (emit: (event: RunEvent) => void) => Promise<void>;
		disabled?: boolean;
		/**
		 * Drop everything but the header, so the panel shrinks to the Run button alone. Used on a
		 * phone while the editor has focus, where the keyboard has already taken half the screen and
		 * output you are not reading is not worth the rest of it.
		 */
		collapsed?: boolean;
	} = $props();

	let running = $state(false);
	let stdout = $state('');
	let stderr = $state('');
	let error = $state('');

	/**
	 * How long the reader has been waiting, from pressing Run to the run being over, ticked ten
	 * times a second — often enough for the tenths to move evenly, rarely enough to cost nothing.
	 *
	 * It measures the wait rather than the process: a sandbox is usually warm by the time Run is
	 * pressed, but when it is not, the boot is part of what someone is sitting through and belongs
	 * in the number. Which is also why it keeps the final time on screen afterwards — "that solve
	 * took 41 seconds" is the thing worth knowing when the answer alone looks the same either way.
	 */
	let elapsedMs = $state(0);
	let startedAt = 0;
	let ticker: ReturnType<typeof setInterval> | undefined;

	/**
	 * Chunks arrive at whatever rate the solution prints at, which for a loop with a print in it
	 * is far faster than anyone can read. They are collected here and handed to the panel a frame
	 * at a time, so a chatty solve costs one re-render per frame rather than one per line.
	 */
	let pendingOut = '';
	let pendingErr = '';
	let frame: number | undefined;

	function flush() {
		frame = undefined;
		if (pendingOut) {
			stdout += pendingOut;
			pendingOut = '';
		}
		if (pendingErr) {
			stderr += pendingErr;
			pendingErr = '';
		}
	}

	function apply(event: RunEvent) {
		if (event.type === 'stdout') pendingOut += event.text;
		else if (event.type === 'stderr') pendingErr += event.text;
		// The sandbox it had started in turned out to be gone, and it is running again on a fresh
		// one — what came out of the old VM is not part of this run.
		else if (event.type === 'reset') {
			pendingOut = '';
			pendingErr = '';
			stdout = '';
			stderr = '';
		} else return;

		frame ??= requestAnimationFrame(flush);
	}

	/**
	 * Follows the newest output, which is the half of streaming that makes it worth having, but
	 * only while the reader is already at the bottom: scrolling up to look at something is a
	 * decision, and yanking the panel back down every time the next line lands undoes it.
	 */
	let panel: HTMLDivElement | undefined = $state();
	let following = $state(true);

	function onScroll() {
		if (!panel) return;
		following = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 24;
	}

	async function run() {
		running = true;
		stdout = '';
		stderr = '';
		error = '';
		pendingOut = '';
		pendingErr = '';
		following = true;

		startedAt = performance.now();
		elapsedMs = 0;
		clearInterval(ticker);
		ticker = setInterval(() => (elapsedMs = performance.now() - startedAt), 100);

		try {
			await onrun(apply);
		} catch (e) {
			error = String(e);
		} finally {
			// The last chunks are still waiting on a frame that will not come if the tab is in the
			// background, and a finished run must not be missing its final lines.
			if (frame !== undefined) cancelAnimationFrame(frame);
			flush();

			clearInterval(ticker);
			ticker = undefined;
			// The tick that would have landed here is up to a tenth of a second stale, and this is
			// the number that stays on screen.
			elapsedMs = performance.now() - startedAt;
			running = false;
		}
	}

	// Nothing should keep ticking, or waiting on a frame, for a panel that has gone.
	$effect(() => () => {
		clearInterval(ticker);
		if (frame !== undefined) cancelAnimationFrame(frame);
	});

	$effect(() => {
		// Read both so this runs whenever either grows, and after the DOM has taken the new text.
		stdout;
		stderr;
		if (following && panel) panel.scrollTop = panel.scrollHeight;
	});

	const hasOutput = $derived(stdout || stderr || error);
	const showElapsed = $derived(running || elapsedMs > 0);
</script>

<div class="flex flex-1 flex-col gap-2 overflow-hidden border-t border-border p-3">
	<div class="flex shrink-0 items-center justify-between">
		<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</span>
		<div class="flex items-center gap-2">
			{#if showElapsed}
				<!-- Tabular figures so a running clock does not shuffle the button sideways. -->
				<span
					class="font-mono text-xs tabular-nums {running
						? 'text-muted-foreground'
						: 'text-muted-foreground/60'}"
				>
					{(elapsedMs / 1000).toFixed(1)}s
				</span>
			{/if}
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
	</div>

	{#if collapsed}
		<!-- header only -->
	{:else if hasOutput}
		<div
			bind:this={panel}
			onscroll={onScroll}
			class="flex-1 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-xs"
		>
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
