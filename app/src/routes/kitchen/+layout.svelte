<script lang="ts">
	import PosRoleGate from '$lib/components/pos/PosRoleGate.svelte';
	import PosToasts from '$lib/components/PosToasts.svelte';

	let { children } = $props();
</script>

<PosRoleGate role="kitchen">
	{@render children()}
	<PosToasts />
</PosRoleGate>
