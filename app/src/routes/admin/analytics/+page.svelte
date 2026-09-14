<script lang="ts">
	import { onMount } from 'svelte';
	import { defaultReportRange, previousPeriod } from '$lib/period';
	import { formatMoney } from '$lib/money';

	type HallRow = { name: string; qty: number; amount_cents: number; orders_count: number };
	type WaiterRow = { name: string; amount_cents: number; orders_count: number; avg_cents: number };
	type ProductRow = { title: string; qty: number; amount_cents: number };
	type CompareRow = {
		title: string;
		currentQty: number;
		currentCents: number;
		prevQty: number;
		prevCents: number;
		deltaPct: number | null;
	};
	type ShiftRow = {
		id: number;
		opened_at: string;
		closed_at: string | null;
		total_cents: number;
		cash_cents: number;
		cashless_cents: number;
		orders_count: number;
	};
	type Summary = {
		total_cents: number;
		cash_cents: number;
		cashless_cents: number;
		orders_count: number;
	};

	type Tab = 'summary' | 'halls' | 'waiters' | 'products' | 'shifts';

	const TABS: Array<{ key: Tab; label: string }> = [
		{ key: 'summary', label: 'Сводка' },
		{ key: 'halls', label: 'Залы' },
		{ key: 'waiters', label: 'Официанты' },
		{ key: 'products', label: 'Товары' },
		{ key: 'shifts', label: 'Смены' }
	];

	let tab = $state<Tab>('summary');
	let from = $state(defaultReportRange().from);
	let to = $state(defaultReportRange().to);
	let previous = $state<{ from: string; to: string } | null>(null);

	let summary = $state<Summary | null>(null);
	let halls = $state<HallRow[]>([]);
	let waiters = $state<WaiterRow[]>([]);
	let products = $state<ProductRow[]>([]);
	let shifts = $state<ShiftRow[]>([]);
	let compare = $state<CompareRow[]>([]);

	let error = $state<string | null>(null);
	let loading = $state(false);

	onMount(() => {
		void load();
	});

	async function load() {
		error = null;
		loading = true;
		const [reportsRes, analyticsRes] = await Promise.all([
			fetch(`/api/admin/reports?from=${from}&to=${to}`),
			fetch(`/api/admin/analytics?from=${from}&to=${to}`)
		]);
		loading = false;
		if (!reportsRes.ok || !analyticsRes.ok) {
			error = 'Не удалось посчитать отчёт. Проверь даты.';
			return;
		}
		const reports = await reportsRes.json();
		const analytics = await analyticsRes.json();
		summary = reports.summary ?? null;
		halls = reports.byHalls ?? [];
		waiters = reports.byWaiters ?? [];
		products = reports.byProducts ?? [];
		shifts = reports.shifts ?? [];
		previous = analytics.previous ?? null;
		compare = analytics.products ?? [];
	}

	async function downloadExcel() {
		error = null;
		const res = await fetch(`/api/admin/export?from=${from}&to=${to}`);
		if (!res.ok) {
			error = 'Не удалось выгрузить Excel';
			return;
		}
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `Report_Sales_${from}_${to}.xlsx`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function deltaClass(value: number | null): string {
		if (value === null) return 'text-slate-500';
		if (value > 0) return 'text-emerald-600';
		if (value < 0) return 'text-rose-600';
		return 'text-slate-700';
	}

	function deltaText(value: number | null): string {
		if (value === null) return '—';
		const sign = value > 0 ? '+' : '';
		return `${sign}${value.toFixed(1)}%`;
	}
</script>

<header class="flex items-center justify-between gap-2 bg-slate-50 px-4 py-3">
	<span class="font-semibold">Отчёты</span>
	<button type="button" onclick={downloadExcel} class="h-10 rounded-md bg-emerald-700 text-white px-3 text-sm font-medium">
		Excel
	</button>
</header>

<div class="space-y-4 px-4 py-4">
	<div class="grid grid-cols-2 gap-2">
		<label class="text-sm text-slate-500">
			С
			<input type="date" bind:value={from} class="mt-1 h-10 w-full rounded-md bg-white px-3 text-slate-900" />
		</label>
		<label class="text-sm text-slate-500">
			По
			<input type="date" bind:value={to} class="mt-1 h-10 w-full rounded-md bg-white px-3 text-slate-900" />
		</label>
	</div>
	<button
		type="button"
		onclick={load}
		disabled={loading}
		class="h-10 w-full rounded-md bg-white text-sm font-medium disabled:opacity-50"
	>
		Пересчитать
	</button>
	{#if error}
		<p class="text-sm text-rose-600">{error}</p>
	{/if}

	<div class="grid grid-cols-5 gap-1">
		{#each TABS as tabItem}
			<button
				type="button"
				onclick={() => (tab = tabItem.key)}
				class="h-10 rounded-md text-xs font-semibold {tab === tabItem.key
					? 'bg-emerald-600 text-white'
					: 'bg-white text-slate-700'}"
			>
				{tabItem.label}
			</button>
		{/each}
	</div>

	{#if tab === 'summary'}
		{#if summary}
			<div class="grid grid-cols-2 gap-2">
				<div class="rounded-md bg-white p-4">
					<p class="text-sm text-slate-500">Выручка</p>
					<p class="text-2xl font-bold">{formatMoney(summary.total_cents)}</p>
				</div>
				<div class="rounded-md bg-white p-4">
					<p class="text-sm text-slate-500">Чеков</p>
					<p class="text-2xl font-bold">{summary.orders_count}</p>
				</div>
				<div class="rounded-md bg-white p-4">
					<p class="text-sm text-slate-500">Наличные</p>
					<p class="text-xl font-semibold">{formatMoney(summary.cash_cents)}</p>
				</div>
				<div class="rounded-md bg-white p-4">
					<p class="text-sm text-slate-500">Безнал</p>
					<p class="text-xl font-semibold">{formatMoney(summary.cashless_cents)}</p>
				</div>
			</div>
		{:else}
			<p class="text-slate-500">Нет данных</p>
		{/if}
	{:else if tab === 'halls'}
		<div class="overflow-x-auto max-h-[60vh] rounded-md border border-slate-200">
			<table class="min-w-[480px] w-full text-sm">
				<thead>
					<tr>
						<th class="sticky top-0 left-0 z-20 bg-white px-3 py-2 text-left">Зал</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Кол-во</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Чеков</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Сумма</th>
					</tr>
				</thead>
				<tbody>
					{#each halls as row}
						<tr class="border-t border-slate-200">
							<td class="sticky left-0 z-10 bg-slate-100 px-3 py-2 font-medium">{row.name}</td>
							<td class="px-3 py-2 text-right">{row.qty}</td>
							<td class="px-3 py-2 text-right">{row.orders_count}</td>
							<td class="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.amount_cents)}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="px-3 py-6 text-center text-slate-500">Нет данных</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if tab === 'waiters'}
		<div class="overflow-x-auto max-h-[60vh] rounded-md border border-slate-200">
			<table class="min-w-[480px] w-full text-sm">
				<thead>
					<tr>
						<th class="sticky top-0 left-0 z-20 bg-white px-3 py-2 text-left">Официант</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Чеков</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Средний</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Сумма</th>
					</tr>
				</thead>
				<tbody>
					{#each waiters as row}
						<tr class="border-t border-slate-200">
							<td class="sticky left-0 z-10 bg-slate-100 px-3 py-2 font-medium">{row.name}</td>
							<td class="px-3 py-2 text-right">{row.orders_count}</td>
							<td class="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.avg_cents)}</td>
							<td class="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.amount_cents)}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="px-3 py-6 text-center text-slate-500">Нет данных</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if tab === 'products'}
		<div class="overflow-x-auto overflow-y-auto max-h-[60vh] rounded-md border border-slate-200">
			<table class="min-w-[640px] w-full text-sm">
				<thead>
					<tr>
						<th class="sticky top-0 left-0 z-20 bg-white px-3 py-2 text-left">Товар</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Текущий</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Прошлый</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Динамика</th>
					</tr>
				</thead>
				<tbody>
					{#each compare as row}
						<tr class="border-t border-slate-200">
							<td class="sticky left-0 z-10 bg-slate-100 px-3 py-2 font-medium">{row.title}</td>
							<td class="px-3 py-2 text-right whitespace-nowrap">
								{row.currentQty} шт / {formatMoney(row.currentCents)}
							</td>
							<td class="px-3 py-2 text-right whitespace-nowrap">
								{row.prevQty} шт / {formatMoney(row.prevCents)}
							</td>
							<td class="px-3 py-2 text-right {deltaClass(row.deltaPct)}">{deltaText(row.deltaPct)}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="px-3 py-6 text-center text-slate-500">Нет продаж за период</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if previous}
			<p class="text-xs text-slate-500">Сравнение с {previous.from} — {previous.to}</p>
		{/if}
	{:else if tab === 'shifts'}
		<div class="overflow-x-auto max-h-[60vh] rounded-md border border-slate-200">
			<table class="min-w-[560px] w-full text-sm">
				<thead>
					<tr>
						<th class="sticky top-0 left-0 z-20 bg-white px-3 py-2 text-left">Смена</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Чеков</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Наличные</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Безнал</th>
						<th class="sticky top-0 z-10 bg-white px-3 py-2 text-right">Итого</th>
					</tr>
				</thead>
				<tbody>
					{#each shifts as row}
						<tr class="border-t border-slate-200">
							<td class="sticky left-0 z-10 bg-slate-100 px-3 py-2 font-medium">№{row.id}</td>
							<td class="px-3 py-2 text-right">{row.orders_count}</td>
							<td class="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.cash_cents)}</td>
							<td class="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.cashless_cents)}</td>
							<td class="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.total_cents)}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="px-3 py-6 text-center text-slate-500">Нет закрытых смен за период</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
