<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { parseDbTimeMs, waiterSeesReady } from '$lib/item-ready';
	import { formatDbTimeHm } from '$lib/time';

	type GuestRef = { name: string; payment_method?: string | null };
	type Preview = { title: string; quantity: number };
	export type WaiterOrder = {
		id: number;
		number: number;
		check_number?: number;
		status?: string;
		total_amount_cents: number;
		unpaid_cents?: number;
		paid_cents?: number;
		cash_cents?: number;
		cashless_cents?: number;
		shortfall_cents?: number;
		writeoff_cents?: number;
		created_at: string;
		closed_at?: string | null;
		hall_id: number;
		waiter_name: string;
		hall_name: string;
		guests: GuestRef[];
		ready_at?: string | null;
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
	let lastTap = 0;
	let longTimer: ReturnType<typeof setTimeout> | undefined;

	const isReady = $derived(waiterSeesReady('ready', order.ready_at, now));
	const oosCount = $derived(order.out_of_stock_count ?? 0);

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
		return method === 'cash'
			? 'Наличные'
			: method === 'cashless'
				? 'Безнал'
				: method === 'mixed'
					? 'Нал+Безнал'
					: '—';
	}

	function paymentSummary(guests: GuestRef[]): string {
		if (guests.length === 0) return '—';
		if (guests.length === 1) return paymentLabel(guests[0].payment_method);
		return guests.map((g) => `${g.name} — ${paymentLabel(g.payment_method)}`).join(' · ');
	}

	function closedPaymentStatus(): { label: string; cls: string } {
		const collected = (order.cash_cents ?? 0) + (order.cashless_cents ?? 0);
		const shortfall = order.shortfall_cents ?? 0;
		if (shortfall > 0) {
			return collected > 0
				? { label: 'Частично оплачен', cls: 'bg-amber-500 text-white' }
				: { label: 'Не оплачен', cls: 'bg-rose-600 text-white' };
		}
		return { label: 'Оплачен', cls: 'bg-emerald-600 text-white' };
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
		if (axis == null) {
			const nowTs = Date.now();
			if (nowTs - lastTap < 300) {
				lastTap = 0;
				onOpen();
			} else {
				lastTap = nowTs;
			}
		}
		dx = 0;
		axis = null;
	}
</script>

<div class="relative">
	<div
		role="button"
		tabindex="0"
		class="relative z-10 rounded-md border border-slate-300 bg-white p-4"
		style="transform: translateX({dx}px); touch-action: pan-y"
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
				<span class="text-base font-bold">{closed ? 'Чек' : 'Заказ'} №{closed
					? (order.check_number ?? order.number)
					: order.number}</span>
				{#if closed}
					<span class="text-xs text-slate-500">{timeHm(order.closed_at)}</span>
				{/if}
				{#if isReady}
					<span
						class="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white"
						aria-label="Готов"
					>
						Готов
					</span>
				{/if}
				{#if oosCount > 0}
					<span class="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
						нет блюда {oosCount}
					</span>
				{/if}
			</span>
			<span class="text-2xl font-extrabold {closed ? 'text-slate-900' : 'text-emerald-700'}"
				>{formatMoney(order.total_amount_cents)}</span
			>
		</div>
		<p class="mt-1 text-sm text-slate-500">
			{#if closed}
				{order.waiter_name} · {order.hall_name}
			{:else}
				{timeHm(order.created_at)} · {ageLabel()} · {order.waiter_name} · {order.hall_name}
			{/if}
		</p>
		{#if !closed && order.paid_cents}
			{@const remaining = order.total_amount_cents - order.paid_cents}
			{#if remaining > 0}
				<p class="mt-1 text-sm font-semibold text-amber-600">неоплачено: {formatMoney(remaining)}</p>
			{:else}
				<p class="mt-1 text-sm font-semibold text-emerald-600">оплачено</p>
			{/if}
		{/if}
		<p class="mt-1 text-sm text-slate-700">
			Гости: {order.guests.map((g) => g.name).join(', ') || '—'}
		</p>
		{#if !closed && order.preview && order.preview.length > 0}
			<p class="mt-1 truncate text-sm text-slate-500">
				{order.preview.map((p) => `${p.quantity}× ${p.title}`).join(', ')}
			</p>
		{/if}
		{#if closed}
			{@const status = closedPaymentStatus()}
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<span class="rounded-full px-2 py-0.5 text-xs font-bold {status.cls}">{status.label}</span>
				<span class="text-xs font-semibold text-slate-500">
					{paymentSummary(order.guests)}
				</span>
			</div>
			{#if order.cashless_cents}
				<p class="mt-1 text-sm text-slate-700">Безнал: {formatMoney(order.cashless_cents)}</p>
			{/if}
			{#if order.cash_cents}
				<p class="mt-1 text-sm text-slate-700">Наличные: {formatMoney(order.cash_cents)}</p>
			{/if}
			{#if order.shortfall_cents}
				<p class="mt-1 text-sm font-semibold text-amber-600">Недоплата: {formatMoney(order.shortfall_cents)}</p>
			{/if}
			{#if order.writeoff_cents}
				<p class="mt-1 text-sm text-slate-500">Списано: {formatMoney(order.writeoff_cents)}</p>
			{/if}
		{/if}
	</div>

	{#if sheet}
		<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
			<div class="w-full max-w-sm rounded-md border border-slate-300 bg-slate-100 p-4">
				<p class="text-lg font-bold">Заказ №{order.number}</p>
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
