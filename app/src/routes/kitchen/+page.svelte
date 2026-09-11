<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PosShell from '$lib/components/PosShell.svelte';
	import type { DeviceSession } from '$lib/types';

	let device = $state<DeviceSession | null>(null);
	let cards = $state<unknown[]>([]);

	onMount(() => {
		let es: EventSource | undefined;
		void (async () => {
			const me = await fetch('/api/devices/me').then((r) => r.json());
			device = me.device;
			if (device?.status !== 'active' || device.role !== 'kitchen') {
				await goto('/');
				return;
			}
			const res = await fetch('/api/kds');
			if (res.ok) {
				const data = await res.json();
				cards = data.cards ?? [];
			}
			es = new EventSource('/api/events');
			es.addEventListener('PRECHECK_UPDATED', () => {
				void fetch('/api/kds').then(async (r) => {
					if (!r.ok) return;
					const data = await r.json();
					cards = data.cards ?? [];
				});
			});
			es.addEventListener('PRECHECK_CANCELLED', () => {
				void fetch('/api/kds').then(async (r) => {
					if (!r.ok) return;
					const data = await r.json();
					cards = data.cards ?? [];
				});
			});
			es.addEventListener('DEVICE_BLOCKED', () => void goto('/'));
		})();
		return () => es?.close();
	});
</script>

<PosShell title="Привет, {device?.userName ?? '…'} · Кухня" hallColor="#1e293b">
	<div class="px-4 py-4">
		<p class="text-sm text-slate-500">В очереди: {cards.length}</p>
		{#if cards.length === 0}
			<p class="mt-10 text-center text-slate-500">Нет заявок. Карточки KDS появятся после «На кухню».</p>
		{/if}
	</div>
</PosShell>
