<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import PosShell from '$lib/components/PosShell.svelte';
	import { POS_SESSION_KEY, onPosEvent, type PosSessionState } from '$lib/client/pos-session.svelte';

	type KdsItem = {
		id: number;
		title: string;
		description: string | null;
		quantity: number;
		status: string;
		ready_at: string | null;
		image_path: string | null;
	};
	type KdsCard = {
		order_id: number;
		created_at: string;
		waiter_name: string;
		hall_id: number;
		hall_name: string;
		hall_color: string;
		items: KdsItem[];
	};
	type Hall = { id: number; name: string; color_hex: string };

	const session = getContext<PosSessionState>(POS_SESSION_KEY);
	const device = $derived(session.device);

	let cards = $state<KdsCard[]>([]);
	let halls = $state<Hall[]>([]);
	let hallId = $state<number | null>(null);
	let now = $state(Date.now());
	let lastTapId = $state<number | null>(null);
	let lastTapAt = 0;
	let queueGen = 0;
	let togglingId = $state<number | null>(null);

	const selectedHall = $derived(halls.find((h) => h.id === hallId) ?? null);
	const visibleCards = $derived(hallId == null ? cards : cards.filter((c) => c.hall_id === hallId));

	onMount(() => {
		void loadHalls();
		void loadQueue();
		const reload = () => void loadQueue();
		const offs = [
			onPosEvent('ORDER_CREATED', reload),
			onPosEvent('ORDER_UPDATED', reload),
			onPosEvent('ORDER_CANCELLED', reload),
			onPosEvent('ORDER_CLOSED', reload),
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

	async function loadHalls() {
		const res = await fetch('/api/halls');
		if (!res.ok) return;
		const data = await res.json();
		halls = data.halls ?? [];
		const key = `kitchen_hall_${device?.locationId ?? 0}`;
		const saved = localStorage.getItem(key);
		if (saved === 'all' || saved == null || saved === '') {
			hallId = null;
			return;
		}
		const savedId = Number(saved);
		hallId = halls.some((h) => h.id === savedId) ? savedId : null;
	}

	function changeHall(id: number | null) {
		hallId = id;
		if (device?.locationId != null) {
			localStorage.setItem(`kitchen_hall_${device.locationId}`, id == null ? 'all' : String(id));
		}
	}

	async function loadQueue() {
		const gen = ++queueGen;
		const res = await fetch('/api/kds');
		if (!res.ok || gen !== queueGen) return;
		const data = (await res.json()) as { cards?: KdsCard[] };
		cards = data.cards ?? [];
	}

	function imageUrl(path: string | null): string {
		return path ? `/api/uploads/${path}` : '';
	}

	function queueAge(dbTime: string, nowMs: number): string {
		const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(dbTime);
		if (!m) return '';
		const created = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
		const mins = Math.max(0, Math.floor((nowMs - created.getTime()) / 60000));
		if (mins < 1) return 'только что';
		if (mins < 60) return `${mins} мин`;
		const hours = Math.floor(mins / 60);
		return `${hours} ч ${mins % 60} мин`;
	}

	function onItemPointerUp(item: KdsItem) {
		const t = Date.now();
		if (lastTapId === item.id && t - lastTapAt < 400) {
			lastTapId = null;
			lastTapAt = 0;
			void toggleReady(item);
			return;
		}
		lastTapId = item.id;
		lastTapAt = t;
	}

	async function toggleReady(item: KdsItem) {
		if (togglingId === item.id) return;
		const next = item.status === 'ready' ? 'pending' : 'ready';
		togglingId = item.id;
		const res = await fetch(`/api/kds/items/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: next })
		});
		togglingId = null;
		if (!res.ok) {
			await loadQueue();
			return;
		}
		const data = (await res.json()) as { status: string; ready_at: string | null };
		cards = cards.map((card) => ({
			...card,
			items: card.items.map((row) =>
				row.id === item.id ? { ...row, status: data.status, ready_at: data.ready_at } : row
			)
		}));
	}
</script>

<PosShell
	title="Привет, {device?.userName ?? '…'} · Кухня"
	hallColor={selectedHall?.color_hex ?? '#065F46'}
	halls={halls.map((h) => ({ id: h.id, name: h.name }))}
	{hallId}
	allowAllHalls
	largeTargets
	onHallChange={changeHall}
>
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<div class="shrink-0 bg-slate-50 px-4 pt-4 pb-3">
			<p class="text-sm text-slate-500">В очереди: {visibleCards.length}</p>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
			{#if visibleCards.length === 0}
				<p class="mt-10 text-center text-slate-500">Нет заявок. Карточки появятся после «На кухню».</p>
			{:else}
				<ul class="space-y-3">
					{#each visibleCards as card (card.order_id)}
						<li class="rounded-md border border-slate-200 bg-white p-4">
							<div class="flex items-baseline justify-between gap-3">
								<p class="text-lg font-bold text-slate-900">Заказ №{card.order_id}</p>
								<p class="text-sm font-semibold text-amber-700">{queueAge(card.created_at, now)}</p>
							</div>
							<p class="mt-1 text-sm text-slate-500">{card.hall_name} · {card.waiter_name}</p>
							<ul class="mt-3 space-y-1.5">
								{#each card.items as item (item.id)}
									<li>
										<button
											type="button"
											disabled={togglingId === item.id}
											class="flex min-h-14 w-full touch-manipulation select-none items-center justify-between gap-3 rounded-md border px-3 text-left text-base font-semibold disabled:opacity-60 {item.status ===
											'ready'
												? 'border-emerald-300 bg-emerald-50 text-emerald-800'
												: 'border-slate-200 bg-slate-50 text-slate-800'}"
											onpointerup={() => onItemPointerUp(item)}
										>
											<span class="flex min-w-0 items-center gap-3">
												{#if item.image_path}
													<img
														src={imageUrl(item.image_path)}
														alt=""
														class="h-10 w-10 shrink-0 rounded object-cover"
													/>
												{/if}
												<span class="min-w-0 flex-1">
													<span class="block truncate">{item.title}</span>
													{#if item.description}
														<span class="block truncate text-xs font-normal text-slate-500">{item.description}</span>
													{/if}
												</span>
											</span>
											<span class="shrink-0">×{item.quantity}</span>
										</button>
									</li>
								{/each}
							</ul>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</PosShell>
