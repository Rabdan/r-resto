<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { parseDbTimeMs, waiterSeesReady } from '$lib/item-ready';
	import { formatDbTimeHm } from '$lib/time';

	type GuestRef = { name: string; payment_method?: string | null };
	type Preview = { title: string; quantity: number };
	export type WaiterOrder = {
		id: number;
		status?: string;
		total_amount_cents: number;
		unpaid_cents?: number;
		created_at: string;
		closed_at?: string | null;
		hall_id: number;
		waiter_name: string;
		hall_name: string;
		guests: GuestRef[];
		ready_at?: Array<string | null>;
		preview?: Preview[];
		out_of_stock_count?: number;
	};

	let {
		order,
		now,
		closed = false,
		onOpen,
		onPay,
		onPrint,
		onAddGuest
	}: {
		order: WaiterOrder;
		now: number;
		closed?: boolean;
		onOpen: () => void;
		onPay?: () => void;
		onPrint: () => void;
		onAddGuest?: () => void;
	} = $props();

	let dx = $state(0);
	let sheet = $state(false);
	let axis = $state<'h' | 'v' | null>(null);
	let startX = 0;
	let startY = 0;
	let longTimer: ReturnType<typeof setTimeout> | undefined;

	const readyCount = $derived(
		(order.ready_at ?? []).filter((at) => waiterSeesReady('ready', at, now)).length
	);
	const oosCount = $derived(order.out_of_stock_count ?? 0);
	const unpaid = $derived(order.unpaid_cents ?? order.total_amount_cents);

	function timeHm(dbTime: string | null | undefined): string {
		return formatDbTimeHm(dbTime);
	}

	function ageLabel(): string {
		const t = parseDbTimeMs(order.created_at);
		if (t == null) return '';
		const mins = Math.max(0, Math.floor((now - t) / 60000));
		if (mins < 1) return 'только что';
		if (mins < 60) return `${mins} мин`;
		return `${Math.floor(mins / 60)} ч ${mins % 60} мин`;
	}

	function paymentLabel(method: string | null | undefined): string {
		return method === 'cash' ? 'Наличные' : method === 'cashless' ? 'Безнал' : '—';
	}

	function paymentSummary(guests: GuestRef[]): string {
		if (guests.length === 0) return '—';
		if (guests.length === 1) return paymentLabel(guests[0].payment_method);
		return guests.map((g) => `${g.name} — ${paymentLabel(g.payment_method)}`).join(' · ');
	}

	function clearLong() {
		if (longTimer !== undefined) {
			clearTimeout(longTimer);
			longTimer = undefined;
		}
	}

	function onDown(e: PointerEvent) {
		if (sheet) return;
		startX = e.clientX;
		startY = e.clientY;
		axis = null;
		dx = 0;
		clearLong();
		if (!closed) {
			longTimer = setTimeout(() => {
				sheet = true;
				dx = 0;
				axis = 'v';
			}, 480);
		}
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onMove(e: PointerEvent) {
		if (sheet) return;
		const mx = e.clientX - startX;
		const my = e.clientY - startY;
		if (axis == null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
			axis = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
			clearLong();
		}
		if (axis === 'h' && !closed) dx = mx;
	}

	function onUp() {
		clearLong();
		if (sheet) {
			dx = 0;
			axis = null;
			return;
		}
		if (axis === 'h' && !closed) {
			if (dx < -64) onPay?.();
			else if (dx > 64) onPrint();
			dx = 0;
			axis = null;
			return;
		}
		if (axis == null) onOpen();
		dx = 0;
		axis = null;
	}
</script>

<div class="relative">
	<div
		role="button"
		tabindex="0"
		class="relative z-10 rounded-md border border-slate-300 bg-white p-4"
		style="transform: translateX({dx}px)"
		onpointerdown={onDown}
		onpointermove={onMove}
		onpointerup={onUp}
		onpointercancel={onUp}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onOpen();
			}
		}}
	>
		<div class="flex items-center justify-between gap-2">
			<span class="flex min-w-0 items-center gap-2">
				<span class="text-base font-bold">{closed ? 'Чек' : 'Заказ'} №{order.id}</span>
				{#if readyCount > 0}
					<span
						class="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white"
						aria-label="Готово"
					>
						готово {readyCount}
					</span>
				{/if}
				{#if oosCount > 0}
					<span class="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
						нет блюда {oosCount}
					</span>
				{/if}
			</span>
			<span class="text-2xl font-extrabold {closed ? 'text-slate-900' : 'text-emerald-700'}"
				>{formatMoney(closed ? order.total_amount_cents : unpaid)}</span
			>
		</div>
		<p class="mt-1 text-sm text-slate-500">
			{timeHm(closed ? order.closed_at : order.created_at)}
			{#if !closed}· {ageLabel()}{/if}
			· {order.waiter_name} · {order.hall_name}
		</p>
		<p class="mt-1 text-sm text-slate-700">
			Гости: {order.guests.map((g) => g.name).join(', ') || '—'}
		</p>
		{#if !closed && order.preview && order.preview.length > 0}
			<p class="mt-1 truncate text-sm text-slate-500">
				{order.preview.map((p) => `${p.quantity}× ${p.title}`).join(', ')}
			</p>
		{/if}
		{#if closed}
			<p class="mt-1 text-sm font-semibold text-slate-700">Оплата: {paymentSummary(order.guests)}</p>
		{/if}
	</div>

	{#if sheet}
		<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
			<div class="w-full max-w-sm rounded-md border border-slate-300 bg-slate-100 p-4">
				<p class="text-lg font-bold">Заказ №{order.id}</p>
				<div class="mt-4 grid gap-2">
					<button
						type="button"
						class="h-12 rounded-md border border-slate-700 bg-slate-600 font-bold text-white"
						onclick={() => {
							sheet = false;
							onPrint();
						}}>Печать</button
					>
					{#if onAddGuest}
						<button
							type="button"
							class="h-12 rounded-md border border-violet-800 bg-violet-600 font-bold text-white"
							onclick={() => {
								sheet = false;
								onAddGuest();
							}}>+ Гость</button
						>
					{/if}
					<button
						type="button"
						class="h-12 rounded-md border border-slate-300 bg-white font-bold text-slate-800"
						onclick={() => (sheet = false)}>Закрыть</button
					>
				</div>
			</div>
		</div>
	{/if}
</div>
