<script lang="ts">
	import '../app.css';
	let { children }: { children: import('svelte').Snippet } = $props();
</script>

<div class="dark">
	{@render children()}
</div>
