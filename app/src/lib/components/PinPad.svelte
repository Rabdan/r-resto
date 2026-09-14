<script lang="ts">
	let { value = $bindable(''), maxLength = 8 } = $props<{
		value: string;
		maxLength?: number;
	}>();

	const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

	function press(key: string) {
		if (key === '') return;
		if (key === 'del') {
			value = value.slice(0, -1);
			return;
		}
		if (value.length >= maxLength) return;
		value += key;
	}
</script>

<div class="grid grid-cols-3 gap-2">
	{#each keys as key}
		{#if key === ''}
			<div></div>
		{:else}
			<button
				type="button"
				onclick={() => press(key)}
				class="h-16 rounded-md border border-slate-300 bg-slate-200 text-2xl font-bold text-slate-900 active:bg-slate-300"
			>
				{key === 'del' ? '⌫' : key}
			</button>
		{/if}
	{/each}
</div>
