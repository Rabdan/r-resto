<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PosShell from '$lib/components/PosShell.svelte';
	import { POS_SESSION_KEY, onPosEvent, type PosSessionState } from '$lib/client/pos-session.svelte';
	import { formatMoney } from '$lib/money';

	type GuestRef = { name: string; payment_method?: string | null };
	type Order = {
		id: number;
		status?: string;
		total_amount_cents: number;
		created_at: string;
		closed_at?: string | null;
		hall_id: number;
		waiter_name: string;
		hall_name: string;
		guests: GuestRef[];
	};
	type Hall = { id: number; name: string; color_hex: string; sort_order: number };

	const session = getContext<PosSessionState>(POS_SESSION_KEY);
	const device = $derived(session.device);

	let orders = $state<Order[]>([]);
	let halls = $state<Hall[]>([]);
	let hallId = $state<number | null>(null);
	let tab = $state<'active' | 'closed'>('active');
	let message = $state<string | null>(null);

	const selectedHall = $derived(halls.find((h) => h.id === hallId) ?? null);
	const visibleOrders = $derived(orders.filter((o) => o.hall_id === hallId));

	onMount(() => {
		void loadHalls();
		void loadOrders();
		const offCancelled = onPosEvent('PRECHECK_CANCELLED', (ev) => {
			try {
				const data = JSON.parse(ev.data) as { orderId?: number };
				message = data.orderId ? `Пречек №${data.orderId} отменён админом` : 'Пречек отменён админом';
			} catch {
				message = 'Пречек отменён админом';
			}
			void loadOrders();
		});
		const offClosed = onPosEvent('PRECHECK_CLOSED', () => void loadOrders());
		return () => {
			offCancelled();
			offClosed();
		};
	});

	async function loadHalls() {
		const res = await fetch('/api/halls');
		if (!res.ok) return;
		const data = await res.json();
		halls = data.halls ?? [];
		const key = `waiter_hall_${device?.locationId ?? 0}`;
		const savedId = Number(localStorage.getItem(key));
		const exists = halls.some((h) => h.id === savedId);
		hallId = exists ? savedId : (halls[0]?.id ?? null);
	}

	function changeHall(id: number) {
		hallId = id;
		if (device?.locationId != null) {
			localStorage.setItem(`waiter_hall_${device.locationId}`, String(id));
		}
	}

	async function loadOrders() {
		const res = await fetch(`/api/orders?tab=${tab}`);
		if (!res.ok) return;
		const data = await res.json();
		orders = data.orders ?? [];
	}

	function setTab(next: 'active' | 'closed') {
		tab = next;
		message = null;
		void loadOrders();
	}

	async function createPrecheck() {
		message = null;
		await goto(`/waiter/new${hallId != null ? `?hallId=${hallId}` : ''}`);
	}

	function timeHm(dbTime: string | null | undefined): string {
		if (!dbTime) return '—';
		const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dbTime);
		if (!m) return dbTime;
		const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}

	function paymentLabel(method: string | null | undefined): string {
		return method === 'cash' ? 'Наличные' : method === 'cashless' ? 'Безнал' : '—';
	}

	function paymentSummary(guests: GuestRef[]): string {
		if (guests.length === 0) return '—';
		if (guests.length === 1) return paymentLabel(guests[0].payment_method);
		return guests.map((g) => `${g.name} — ${paymentLabel(g.payment_method)}`).join(' · ');
	}
</script>

<PosShell
	title="Привет, {device?.userName ?? '…'}"
	hallColor={selectedHall?.color_hex ?? '#065F46'}
	halls={halls.map((h) => ({ id: h.id, name: h.name }))}
	{hallId}
	onHallChange={changeHall}
>
	<div class="px-4 pt-3">
		<div class="grid grid-cols-2 gap-2">
			<button
				onclick={() => setTab('active')}
				class="h-12 rounded text-base font-bold {tab === 'active'
					? 'bg-emerald-700 text-white'
					: 'bg-slate-200 text-slate-700'}"
			>
				Активные
			</button>
			<button
				onclick={() => setTab('closed')}
				class="h-12 rounded text-base font-bold {tab === 'closed'
					? 'bg-emerald-700 text-white'
					: 'bg-slate-200 text-slate-700'}"
			>
				Закрытые
			</button>
		</div>
		{#if message}
			<p class="mt-3 text-sm text-amber-600">{message}</p>
		{/if}

		{#if tab === 'active'}
			<ul class="mt-4 space-y-3">
				{#each visibleOrders as order}
					<a
						href="/waiter/{order.id}"
						class="block rounded-md border-2 border-slate-200 bg-white p-4"
					>
						<div class="flex items-center justify-between gap-2">
							<span class="text-base font-bold">Пречек №{order.id}</span>
							<span class="text-2xl font-extrabold text-emerald-700"
								>{formatMoney(order.total_amount_cents)}</span
							>
						</div>
						<p class="mt-1 text-sm text-slate-500">
							{timeHm(order.created_at)} · {order.waiter_name} · {order.hall_name}
						</p>
						<p class="mt-1 text-sm text-slate-700">
							Гости: {order.guests.map((g) => g.name).join(', ') || '—'}
						</p>
					</a>
				{:else}
					<p class="mt-8 text-center text-slate-500">Нет активных пречеков</p>
				{/each}
			</ul>
		{:else}
			<ul class="mt-4 space-y-3">
				{#each visibleOrders as order}
					<div class="rounded-md border-2 border-slate-200 bg-white p-4">
						<div class="flex items-center justify-between gap-2">
							<span class="text-base font-bold">Чек №{order.id}</span>
							<span class="text-2xl font-extrabold text-slate-900"
								>{formatMoney(order.total_amount_cents)}</span
							>
						</div>
						<p class="mt-1 text-sm text-slate-500">
							{timeHm(order.closed_at)} · {order.waiter_name}
						</p>
						<p class="mt-1 text-sm text-slate-700">
							Гости: {order.guests.map((g) => g.name).join(', ') || '—'}
						</p>
						<p class="mt-1 text-sm font-semibold text-slate-700">Оплата: {paymentSummary(order.guests)}</p>
					</div>
				{:else}
					<p class="mt-8 text-center text-slate-500">Нет закрытых чеков за смену</p>
				{/each}
			</ul>
		{/if}
	</div>
	{#if tab === 'active'}
		<button
			onclick={createPrecheck}
			class="fixed bottom-4 left-4 right-4 h-16 rounded-md text-lg font-bold text-white"
			style={`background-color: ${selectedHall?.color_hex ?? '#065F46'}`}
		>
			Создать новый пречек
		</button>
	{/if}
</PosShell>
