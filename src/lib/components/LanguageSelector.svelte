<script lang="ts">
	import { LANGUAGES, LANGUAGE_LABELS } from '$lib/constants.js';
	import type { Language } from '$lib/types.js';

	let {
		value = $bindable<Language>('python'),
		onchange
	}: {
		value?: Language;
		onchange?: (lang: Language) => void;
	} = $props();

	function handleChange(e: Event) {
		const lang = (e.target as HTMLSelectElement).value as Language;
		value = lang;
		onchange?.(lang);
	}
</script>

<select
	{value}
	onchange={handleChange}
	class="h-8 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
>
	{#each LANGUAGES as lang (lang)}
		<option value={lang}>{LANGUAGE_LABELS[lang]}</option>
	{/each}
</select>
