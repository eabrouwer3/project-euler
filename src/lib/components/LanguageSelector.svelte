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
	class="h-8 min-w-0 max-w-40 rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 md:max-w-none md:px-3 md:text-sm"
>
	{#each LANGUAGES as lang (lang)}
		<option value={lang}>{LANGUAGE_LABELS[lang]}</option>
	{/each}
</select>
