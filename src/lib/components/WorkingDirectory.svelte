<script lang="ts">
	// What a run will find in the directory it executes in. Worth its own strip under the editor
	// rather than a line in the problem text: a problem that hands out a data file expects you to
	// open it by name, and the name is not guessable — problem 22 links `0022_names.txt` and calls
	// it names.txt in the same sentence. Sitting beside the editor, it is also readable on a phone,
	// where the problem panel is off-canvas the entire time you are typing.
	import { solutionFiles } from '$lib/constants.js';
	import type { Language, ProblemAttachment } from '$lib/types.js';

	let {
		language,
		packages = [],
		attachments = []
	}: {
		language: Language;
		packages?: string[];
		attachments?: ProblemAttachment[];
	} = $props();

	const solution = $derived(solutionFiles(language, packages));

	function dataFileTitle(attachment: ProblemAttachment): string {
		const provided = "Provided by the problem — it is already there, no download needed";
		return attachment.aliases.length > 0
			? `${provided}. Also readable as ${attachment.aliases.join(', ')}.`
			: provided;
	}
</script>

<div
	class="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-3 py-2 text-xs"
>
	<span class="font-semibold uppercase tracking-wider text-muted-foreground">
		Working directory
	</span>

	<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground" title="Your code">
		{solution.source}
	</code>
	{#if solution.manifest}
		<code
			class="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground"
			title="Written from the packages above"
		>
			{solution.manifest}
		</code>
	{/if}

	{#each attachments as attachment (attachment.url)}
		<code
			class="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-foreground"
			title={dataFileTitle(attachment)}
		>
			{attachment.name}
		</code>
	{/each}
</div>
