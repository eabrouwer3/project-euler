<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	let { children }: { children: import('svelte').Snippet } = $props();
</script>

<ModeWatcher />
{@render children()}
