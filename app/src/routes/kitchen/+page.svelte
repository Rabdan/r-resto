<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import PosShell from '$lib/components/PosShell.svelte';
	import { POS_SESSION_KEY, onPosEvent, type PosSessionState } from '$lib/client/pos-session.svelte';

	type KdsCard = {
		order_id: number;
		created_at: string;
		waiter_name: string;
		hall_name: string;
	};

	const session = getContext<PosSessionState>(POS_SESSION_KEY);
	const device = $derived(session.device);

	let cards = $state<KdsCard[]>([]);
	let now = $state(Date.now());

	onMount(() => {
		void loadQueue();
		const reload = () => void loadQueue();
		const offs = [
			onPosEvent('PRECHECK_CREATED', reload),
			onPosEvent('PRECHECK_UPDATED', reload),
			onPosEvent('PRECHECK_CANCELLED', reload),
			onPosEvent('PRECHECK_CLOSED', reload),
			onPosEvent('ITEM_STATUS_CHANGED', reload)
		];
		const tick = setInterval(() => {
			now = Date.now();
		}, 30000);
		return () => {
			for (const off of offs) off();
			clearInterval(tick);
		};
	});

	async function loadQueue() {
		const res = await fetch('/api/kds');
		if (!res.ok) return;
		const data = (await res.json()) as { cards?: KdsCard[] };
		cards = data.cards ?? [];
	}

	function queueAge(dbTime: string, _now: number): string {
		const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(dbTime);
		if (!m) return '';
		const created = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
		const mins = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
		if (mins < 1) return 'только что';
		if (mins < 60) return `${mins} мин`;
		const hours = Math.floor(mins / 60);
		return `${hours} ч ${mins % 60} мин`;
	}
</script>

<PosShell title="Привет, {device?.userName ?? '…'} · Кухня" hallColor="#1e293b">
	<div class="px-4 py-4">
		<p class="text-sm text-slate-400">В очереди: {cards.length}</p>
		{#if cards.length === 0}
			<p class="mt-10 text-center text-slate-400">Нет заявок. Карточки KDS появятся после «На кухню».</p>
		{:else}
			<ul class="mt-4 space-y-3">
				{#each cards as card (card.order_id)}
					<li class="rounded-md border border-slate-700 bg-slate-800 p-4">
						<div class="flex items-baseline justify-between gap-3">
							<p class="text-lg font-bold">Пречек №{card.order_id}</p>
							<p class="text-sm font-semibold text-amber-400">{queueAge(card.created_at, now)}</p>
						</div>
						<p class="mt-2 text-sm text-slate-300">{card.hall_name} · {card.waiter_name}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</PosShell>
