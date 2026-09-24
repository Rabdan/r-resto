<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PosShell from '$lib/components/PosShell.svelte';
	import OrderCard, { type WaiterOrder } from '$lib/components/waiter/OrderCard.svelte';
	import { POS_SESSION_KEY, onPosEvent, type PosSessionState } from '$lib/client/pos-session.svelte';
	import {
		cancelOrderReadyToast,
		notify,
		scheduleOrderReadyToast
	} from '$lib/client/notifications.svelte';

	type Hall = { id: number; name: string; color_hex: string; sort_order: number };

	const session = getContext<PosSessionState>(POS_SESSION_KEY);
	const device = $derived(session.device);

	let orders = $state<WaiterOrder[]>([]);
	let halls = $state<Hall[]>([]);
	let hallId = $state<number | null>(null);
	let tab = $state<'active' | 'closed'>('active');
	let message = $state<string | null>(null);
	let now = $state(Date.now());
	let shiftOpen = $state(true);

	const selectedHall = $derived(halls.find((h) => h.id === hallId) ?? null);
	const visibleOrders = $derived(
		hallId == null ? orders : orders.filter((o) => o.hall_id === hallId)
	);

	onMount(() => {
		void loadHalls();
		void loadOrders();
		const reload = () => void loadOrders();
		const offs = [
			onPosEvent('ORDER_CANCELLED', (ev) => {
				try {
					const data = JSON.parse(ev.data) as { orderId?: number; number?: number };
					const n = data.number ?? data.orderId;
					message = n ? `Заказ №${n} отменён админом` : 'Заказ отменён админом';
				} catch {
					message = 'Заказ отменён админом';
				}
				reload();
			}),
			onPosEvent('ORDER_CLOSED', reload),
			onPosEvent('ORDER_CREATED', (ev) => {
				try {
					const data = JSON.parse(ev.data) as {
						orderId?: number;
						number?: number;
						waiterId?: number;
						hallId?: number;
					};
					if (hallId == null || data.hallId == null || data.hallId === hallId) {
						if (data.waiterId != null && data.waiterId !== device?.userId) {
							notify(`Новый заказ №${data.number ?? data.orderId}`, { kind: 'info' });
						}
					}
				} catch {
					/* ignore */
				}
				reload();
			}),
			onPosEvent('ORDER_UPDATED', (ev) => {
				try {
					const data = JSON.parse(ev.data) as { orderId?: number };
					if (data.orderId != null) cancelOrderReadyToast(data.orderId);
				} catch {
					/* ignore */
				}
				reload();
			}),
			onPosEvent('ITEM_STATUS_CHANGED', (ev) => {
				try {
					const data = JSON.parse(ev.data) as { orderId?: number };
					if (data.orderId != null) cancelOrderReadyToast(data.orderId);
				} catch {
					/* ignore */
				}
				reload();
			}),
			onPosEvent('ORDER_READY', (ev) => {
				try {
					const data = JSON.parse(ev.data) as {
						orderId?: number;
						number?: number;
						hallId?: number;
					};
					if (eventHallMatches(ev) && data.orderId != null) {
						scheduleOrderReadyToast(data.orderId, data.number ?? data.orderId);
					}
				} catch {
					/* ignore */
				}
				reload();
			}),
		onPosEvent('SHIFT_OPENED', (ev) => {
			if (eventHallMatches(ev)) reload();
		}),
		onPosEvent('SHIFT_CLOSED', (ev) => {
			if (eventHallMatches(ev)) {
				message = 'Смена закрыта';
				reload();
			}
		})
		];
		const tick = setInterval(() => {
			now = Date.now();
		}, 1000);
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
		const key = `waiter_hall_${device?.locationId ?? 0}`;
		const savedId = Number(localStorage.getItem(key));
		const exists = halls.some((h) => h.id === savedId);
		hallId = exists ? savedId : (halls[0]?.id ?? null);
		void loadOrders();
	}

	function changeHall(id: number | null) {
		if (id == null) return;
		hallId = id;
		if (device?.locationId != null) {
			localStorage.setItem(`waiter_hall_${device.locationId}`, String(id));
		}
		void loadOrders();
	}

	function eventHallMatches(ev: { data: string }): boolean {
		try {
			const data = JSON.parse(ev.data) as { hallId?: number };
			return hallId == null || data.hallId == null || data.hallId === hallId;
		} catch {
			return true;
		}
	}

	async function loadOrders() {
		const hallParam = hallId != null ? `&hallId=${hallId}` : '';
		const res = await fetch(`/api/orders?tab=${tab === 'closed' ? 'closed' : 'open'}${hallParam}`);
		if (!res.ok) return;
		const data = await res.json();
		orders = data.orders ?? [];
		if (typeof data.shiftOpen === 'boolean') shiftOpen = data.shiftOpen;
	}

	function setTab(next: 'active' | 'closed') {
		tab = next;
		message = null;
		void loadOrders();
	}

	async function createOrder() {
		if (!shiftOpen) {
			message = 'Смена закрыта';
			return;
		}
		message = null;
		await goto(`/waiter/new${hallId != null ? `?hallId=${hallId}` : ''}`);
	}
</script>

<PosShell
	title="Привет, {device?.userName ?? '…'}"
	hallColor={selectedHall?.color_hex ?? '#065F46'}
	halls={halls.map((h) => ({ id: h.id, name: h.name }))}
	{hallId}
	onHallChange={changeHall}
>
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		<div class="shrink-0 bg-slate-50 px-4 pt-4 pb-3">
			<div class="grid grid-cols-2 gap-2">
				<button
					onclick={() => setTab('active')}
					class="h-12 rounded-md border text-base font-bold {tab === 'active'
						? 'border-emerald-800 bg-emerald-700 text-white'
						: 'border-slate-300 bg-slate-200 text-slate-700'}"
				>
					Активные
				</button>
				<button
					onclick={() => setTab('closed')}
					class="h-12 rounded-md border text-base font-bold {tab === 'closed'
						? 'border-emerald-800 bg-emerald-700 text-white'
						: 'border-slate-300 bg-slate-200 text-slate-700'}"
				>
					Закрытые
				</button>
			</div>
			{#if !shiftOpen}
				<p class="mt-3 text-sm text-amber-700">Смена закрыта. Новый заказ создать нельзя.</p>
			{/if}
			{#if message}
				<p class="mt-3 text-sm text-amber-600">{message}</p>
			{/if}
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 {tab === 'active' ? 'pb-24' : 'pb-4'}">
			{#if tab === 'active'}
				<ul class="space-y-3">
					{#each visibleOrders as order (order.id)}
						<li>
							<OrderCard
								{order}
								{now}
								onOpen={() => void goto(`/waiter/${order.id}`)}
								onPay={() => void goto(`/waiter/${order.id}?pay=1`)}
								onPrint={() => void goto(`/waiter/${order.id}?print=1`)}
								onAddGuest={() => void goto(`/waiter/${order.id}?addGuest=1`)}
							/>
						</li>
					{:else}
						<p class="mt-8 text-center text-slate-500">Нет активных заказов</p>
					{/each}
				</ul>
			{:else}
				<ul class="space-y-3">
					{#each visibleOrders as order (order.id)}
						<li>
							<OrderCard
								{order}
								{now}
								closed
								onOpen={() => void goto(`/waiter/${order.id}`)}
								onPrint={() => void goto(`/waiter/${order.id}?print=1`)}
							/>
						</li>
					{:else}
						<p class="mt-8 text-center text-slate-500">Нет закрытых чеков за смену</p>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
	{#if tab === 'active'}
		<button
			onclick={createOrder}
			disabled={!shiftOpen}
			class="fixed bottom-4 left-4 right-4 h-16 rounded-md border border-black/25 text-lg font-bold text-white disabled:opacity-50"
			style={`background-color: ${selectedHall?.color_hex ?? '#065F46'}`}
		>
			Создать заказ
		</button>
	{/if}
</PosShell>
