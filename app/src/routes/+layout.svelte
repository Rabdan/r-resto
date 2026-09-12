<script lang="ts">
	import '../app.css';
	import { setCurrency } from '$lib/money';

	let { children, data } = $props();

	$effect(() => {
		if (data.currency) setCurrency(data.currency);
	});
</script>

<div class="min-h-dvh">
	{@render children()}
</div>
