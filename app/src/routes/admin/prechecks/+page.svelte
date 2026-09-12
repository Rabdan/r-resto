<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		void goto('/admin/shift', { replaceState: true });
	});
</script>

<p class="px-4 py-6 text-slate-500">Перенаправление на смену…</p>
