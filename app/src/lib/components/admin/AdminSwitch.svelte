<script lang="ts">
	let {
		checked,
		disabled = false,
		label,
		onchange
	}: {
		checked: boolean;
		disabled?: boolean;
		label: string;
		onchange: (next: boolean) => void;
	} = $props();
</script>

<div class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5">
	<span class="text-xs font-semibold text-slate-700">{label}</span>
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		{disabled}
		onclick={() => onchange(!checked)}
		class="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 {checked
			? 'bg-emerald-500'
			: 'bg-slate-300'}"
	>
		<span
			class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {checked
				? 'translate-x-4'
				: ''}"
		></span>
	</button>
</div>
