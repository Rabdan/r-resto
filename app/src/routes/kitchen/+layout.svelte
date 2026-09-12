<script lang="ts">
	import PosRoleGate from '$lib/components/pos/PosRoleGate.svelte';

	let { children } = $props();
</script>

<PosRoleGate role="kitchen">
	{@render children()}
</PosRoleGate>
