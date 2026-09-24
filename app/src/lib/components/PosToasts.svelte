<script lang="ts">
	import { toasts, type ToastKind } from '$lib/client/notifications.svelte';

	function kindClass(kind: ToastKind): string {
		if (kind === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-900';
		if (kind === 'warn') return 'border-amber-300 bg-amber-50 text-amber-900';
		return 'border-slate-300 bg-white text-slate-900';
	}
</script>

<div class="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col gap-2 p-3">
	{#each toasts as toast (toast.id)}
		<div class="pointer-events-auto rounded-md border px-4 py-3 shadow-lg {kindClass(toast.kind)}">
			<p class="text-base font-bold">{toast.title}</p>
			{#if toast.body}
				<p class="mt-0.5 text-sm opacity-80">{toast.body}</p>
			{/if}
		</div>
	{/each}
</div>
