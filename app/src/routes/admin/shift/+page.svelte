<script lang="ts">
	import { onMount } from 'svelte';
	import { formatMoney, parseMoney } from '$lib/money';

	type ShiftExpense = {
		id: number;
		created_at: string;
		payment_method: 'cash' | 'cashless';
		amount_cents: number;
		comment: string | null;
	};
	type Item = { title: string; quantity: number; price_cents: number; status: string };
	type Guest = { name: string; is_paid: number };
	type OpenOrder = {
		id: number;
		created_at: string;
		waiter_name: string;
		hall_name: string;
		total_cents: number;
		items: Item[];
		guests: Guest[];
	};
	type ClosedCheck = {
		id: number;
		created_at: string;
		closed_at: string | null;
		waiter_name: string;
		hall_name: string;
		total_cents: number;
	};
	type CancelledOrder = {
		id: number;
		created_at: string;
		cancelled_at: string | null;
		cancel_reason: string | null;
		waiter_name: string;
		cancelled_by: string | null;
		total_cents: number;
	};
	type Shift = {
		id: number;
		opened_at: string;
		closed_at: string | null;
		status: string;
		opened_by: string | null;
		closed_by: string | null;
		z: {
			total_cents: number;
			cash_cents: number;
			cashless_cents: number;
			orders_count: number;
			by_halls: Array<{ name: string; cents: number }>;
			by_waiters: Array<{ name: string; cents: number }>;
			created_at: string;
		} | null;
		orders_count: number;
		cash_cents: number;
		cashless_cents: number;
		revenue_cents: number;
		expenses_cents: number;
		net_cents: number;
		expenses: ShiftExpense[];
		open: OpenOrder[];
		closed_checks: ClosedCheck[];
		cancelled: CancelledOrder[];
	};

	type Tab = 'all' | 'open' | 'closed' | 'cancelled';

	const TABS: Array<{ key: Tab; label: string }> = [
		{ key: 'all', label: 'Все' },
		{ key: 'open', label: 'Незакрытые' },
		{ key: 'closed', label: 'Закрытые' },
		{ key: 'cancelled', label: 'Отменённые' }
	];

	const presets = ['Ошибка ввода', 'Отказ гостя'];

	let shifts = $state<Shift[]>([]);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);
	let expanded = $state<number | null>(null);
	let tab = $state<Tab>('open');

	let target = $state<OpenOrder | null>(null);
	let preset = $state(presets[0]);
	let customReason = $state('');
	let submitting = $state(false);

	let expTime = $state('');
	let expAmount = $state('');
	let expMethod = $state<'cash' | 'cashless'>('cash');
	let expComment = $state('');
	let expSubmitting = $state(false);

	const openShift = $derived(shifts.find((s) => s.status === 'open') ?? null);
	const closedShifts = $derived(shifts.filter((s) => s.status === 'closed'));

	onMount(() => {
		expTime = nowLocalInput();
		void load();
	});

	async function load() {
		const res = await fetch('/api/admin/shifts');
		if (!res.ok) {
			error = 'Не удалось загрузить смены';
			return;
		}
		const data = await res.json();
		shifts = data.shifts ?? [];
	}

	async function openNewShift() {
		message = null;
		error = null;
		const res = await fetch('/api/shifts', { method: 'POST' });
		const data = await res.json();
		if (!res.ok) {
			error = data.error === 'already_open' ? 'Смена уже открыта' : 'Ошибка открытия смены';
			return;
		}
		message = 'Смена открыта';
		expTime = nowLocalInput();
		await load();
	}

	async function closeShift() {
		message = null;
		error = null;
		const res = await fetch('/api/admin/shifts/close', { method: 'POST' });
		const data = await res.json();
		if (!res.ok) {
			error = data.error ?? 'Ошибка закрытия смены';
			return;
		}
		message = 'Смена закрыта, Z-отчёт сформирован';
		await load();
	}

	async function exportZ(id: number) {
		const res = await fetch(`/api/admin/shifts/${id}/export`);
		if (!res.ok) return;
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `Z_Report_Shift_${id}.xlsx`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function reasonText(): string {
		if (preset === 'Другое') return customReason.trim();
		return preset;
	}

	async function confirmCancel() {
		if (!target) return;
		const reason = reasonText();
		if (reason.length < 2) {
			error = 'Укажи причину отмены';
			return;
		}
		submitting = true;
		const res = await fetch(`/api/admin/orders/${target.id}/cancel`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reason })
		});
		submitting = false;
		if (!res.ok) {
			error = 'Не удалось отменить заказ';
			return;
		}
		target = null;
		customReason = '';
		preset = presets[0];
		message = 'Заказ отменён';
		await load();
	}

	async function addExpense() {
		if (!openShift) return;
		error = null;
		message = null;
		const amount = parseMoney(expAmount);
		if (!Number.isFinite(amount) || amount <= 0) {
			error = 'Укажи сумму расхода';
			return;
		}
		const createdAt = inputToSqlite(expTime);
		if (!createdAt) {
			error = 'Укажи время расхода';
			return;
		}
		expSubmitting = true;
		const res = await fetch('/api/admin/expenses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				amount_cents: amount,
				payment_method: expMethod,
				comment: expComment.trim(),
				created_at: createdAt
			})
		});
		const data = await res.json().catch(() => ({}));
		expSubmitting = false;
		if (!res.ok) {
			error = data.error ?? 'Не удалось сохранить расход';
			return;
		}
		expAmount = '';
		expComment = '';
		expTime = nowLocalInput();
		message = 'Расход добавлен';
		await load();
	}

	async function removeExpense(id: number) {
		error = null;
		const res = await fetch(`/api/admin/expenses/${id}`, { method: 'DELETE' });
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = data.error ?? 'Не удалось удалить расход';
			return;
		}
		await load();
	}

	function datetimeLabel(dbTime: string | null | undefined): string {
		if (!dbTime) return '—';
		const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dbTime);
		if (!m) return dbTime;
		return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}`;
	}

	function nowLocalInput(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function inputToSqlite(value: string): string | null {
		const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
		if (!m) return null;
		return `${m[1]} ${m[2]}:00`;
	}

	function methodLabel(method: 'cash' | 'cashless'): string {
		return method === 'cash' ? 'Наличные' : 'Банк';
	}
</script>

<header class="bg-slate-50 px-4 py-3 font-semibold">Смена</header>
<div class="space-y-4 px-4 py-4">
	{#if error}
		<p class="text-sm text-rose-600">{error}</p>
	{/if}
	{#if message}
		<p class="text-sm text-emerald-600">{message}</p>
	{/if}

	{#if openShift}
		<div class="rounded-md border-2 border-emerald-500 bg-white p-4">
			<p class="font-semibold">Смена №{openShift.id} открыта</p>
			<p class="text-sm text-slate-500">Открыта: {datetimeLabel(openShift.opened_at)}</p>
			<button
				type="button"
				onclick={() => {
					if (confirm('Закрыть смену и сформировать Z-отчёт?')) void closeShift();
				}}
				class="mt-3 h-10 w-full rounded-md bg-rose-600 text-sm font-semibold text-white"
			>
				Закрыть смену и сформировать Z-отчёт
			</button>
		</div>

		<div class="grid grid-cols-3 gap-2">
			<div class="rounded-md bg-white p-3">
				<p class="text-xs text-slate-500">Банк</p>
				<p class="font-semibold">{formatMoney(openShift.cashless_cents)}</p>
			</div>
			<div class="rounded-md bg-white p-3">
				<p class="text-xs text-slate-500">Касса</p>
				<p class="font-semibold">{formatMoney(openShift.cash_cents)}</p>
			</div>
			<div class="rounded-md bg-white p-3">
				<p class="text-xs text-slate-500">Выручка</p>
				<p class="font-semibold">{formatMoney(openShift.revenue_cents)}</p>
			</div>
		</div>

		<section class="space-y-3">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Чеки за смену</h2>
			<div class="grid grid-cols-4 gap-2">
				{#each TABS as tabItem}
					<button
						type="button"
						onclick={() => (tab = tabItem.key)}
						class="h-10 rounded-md text-sm font-semibold {tab === tabItem.key
							? 'bg-emerald-600 text-white'
							: 'bg-white text-slate-700'}"
					>
						{tabItem.label}
					</button>
				{/each}
			</div>

			{#if tab === 'open'}
				{#each openShift.open as order}
					<article class="rounded-md border border-slate-200 bg-white p-4">
						<div class="flex items-start justify-between gap-2">
							<div>
								<p class="font-semibold">Заказ №{order.id}</p>
								<p class="text-sm text-slate-500">
									{order.waiter_name} · {order.hall_name}
								</p>
								<p class="text-xs text-slate-500">{datetimeLabel(order.created_at)}</p>
							</div>
							<p class="font-semibold">{formatMoney(order.total_cents)}</p>
						</div>
						<p class="mt-2 text-sm text-slate-700">
							Гости: {order.guests.map((g) => g.name).join(', ') || '—'}
						</p>
						<ul class="mt-2 space-y-1 text-sm text-slate-700">
							{#each order.items as item}
								<li>{item.quantity}× {item.title} — {formatMoney(item.price_cents * item.quantity)}</li>
							{:else}
								<li class="text-slate-500">Позиций нет</li>
							{/each}
						</ul>
						<button
							type="button"
							onclick={() => {
								target = order;
								error = null;
							}}
							class="mt-3 h-10 w-full rounded-md bg-rose-100 text-sm font-semibold text-rose-700"
						>
							Отменить заказ
						</button>
					</article>
				{:else}
					<p class="text-slate-500">Нет незакрытых заказов</p>
				{/each}
			{:else if tab === 'closed'}
				<ul class="space-y-2">
					{#each openShift.closed_checks as order}
						<li class="rounded-md border border-slate-200 bg-white p-3">
							<div class="flex justify-between gap-2">
								<span class="font-semibold">Чек №{order.id}</span>
								<span class="font-semibold">{formatMoney(order.total_cents)}</span>
							</div>
							<p class="text-sm text-slate-500">{order.waiter_name} · {order.hall_name}</p>
							<p class="text-xs text-slate-500">Закрыт: {datetimeLabel(order.closed_at)}</p>
						</li>
					{:else}
						<li class="text-slate-500">Нет закрытых чеков</li>
					{/each}
				</ul>
			{:else if tab === 'cancelled'}
				<ul class="space-y-2">
					{#each openShift.cancelled as order}
						<li class="rounded-md border border-slate-200 bg-slate-100 p-3 text-sm">
							<div class="flex justify-between">
								<span class="font-medium">№{order.id}</span>
								<span>{formatMoney(order.total_cents)}</span>
							</div>
							<p class="text-slate-500">{order.waiter_name} · {order.cancelled_by ?? 'админ'}</p>
							<p class="text-rose-600">{order.cancel_reason}</p>
						</li>
					{:else}
						<li class="text-slate-500">Пока нет отмен</li>
					{/each}
				</ul>
			{:else}
				<ul class="space-y-2">
					{#each openShift.open as order}
						<li class="rounded-md border border-slate-200 bg-white p-3">
							<div class="flex justify-between gap-2">
								<span class="font-semibold">Заказ №{order.id}</span>
								<span class="font-semibold">{formatMoney(order.total_cents)}</span>
							</div>
							<p class="text-sm text-slate-500">{order.waiter_name} · {order.hall_name}</p>
							<p class="text-xs text-emerald-600">незакрыт</p>
						</li>
					{/each}
					{#each openShift.closed_checks as order}
						<li class="rounded-md border border-slate-200 bg-white p-3">
							<div class="flex justify-between gap-2">
								<span class="font-semibold">Чек №{order.id}</span>
								<span class="font-semibold">{formatMoney(order.total_cents)}</span>
							</div>
							<p class="text-sm text-slate-500">{order.waiter_name} · {order.hall_name}</p>
							<p class="text-xs text-slate-500">закрыт</p>
						</li>
					{/each}
					{#each openShift.cancelled as order}
						<li class="rounded-md border border-slate-200 bg-slate-100 p-3">
							<div class="flex justify-between gap-2">
								<span class="font-semibold">№{order.id}</span>
								<span class="font-semibold">{formatMoney(order.total_cents)}</span>
							</div>
							<p class="text-sm text-slate-500">{order.waiter_name}</p>
							<p class="text-xs text-rose-600">отменён</p>
						</li>
					{/each}
					{#if openShift.open.length === 0 && openShift.closed_checks.length === 0 && openShift.cancelled.length === 0}
						<li class="text-slate-500">Чеков нет</li>
					{/if}
				</ul>
			{/if}
		</section>

		<section class="space-y-3">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Расходы</h2>
			<div class="space-y-3 rounded-md border border-slate-200 bg-white p-4">
				<label class="block text-sm text-slate-600">
					Время
					<input
						type="datetime-local"
						bind:value={expTime}
						class="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3"
					/>
				</label>
				<label class="block text-sm text-slate-600">
					Сумма
					<input
						type="number"
						inputmode="decimal"
						min="0"
						bind:value={expAmount}
						class="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3"
						placeholder="0"
					/>
				</label>
				<div>
					<p class="text-sm text-slate-600">Тип расхода</p>
					<div
						class="mt-1 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1"
						role="radiogroup"
						aria-label="Тип расхода"
					>
						<button
							type="button"
							role="radio"
							aria-checked={expMethod === 'cashless'}
							onclick={() => (expMethod = 'cashless')}
							class="h-10 flex-1 rounded-md text-sm font-semibold {expMethod === 'cashless'
								? 'bg-emerald-600 text-white'
								: 'bg-white text-slate-700'}"
						>
							Банк
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={expMethod === 'cash'}
							onclick={() => (expMethod = 'cash')}
							class="h-10 flex-1 rounded-md text-sm font-semibold {expMethod === 'cash'
								? 'bg-emerald-600 text-white'
								: 'bg-white text-slate-700'}"
						>
							Наличные
						</button>
					</div>
				</div>
				<label class="block text-sm text-slate-600">
					Примечание
					<textarea
						bind:value={expComment}
						class="mt-1 min-h-16 w-full rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
						placeholder="Необязательно"
					></textarea>
				</label>
				<button
					type="button"
					onclick={() => void addExpense()}
					disabled={expSubmitting}
					class="h-10 w-full rounded-md bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"
				>
					Добавить расход
				</button>
			</div>

			<div class="overflow-x-auto rounded-md border border-slate-200 bg-white">
				<table class="w-full min-w-[28rem] text-left text-sm">
					<thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
						<tr>
							<th class="px-3 py-2 font-semibold">Время</th>
							<th class="px-3 py-2 font-semibold">Сумма</th>
							<th class="px-3 py-2 font-semibold">Тип</th>
							<th class="px-3 py-2 font-semibold">Примечание</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each openShift.expenses as row}
							<tr class="border-t border-slate-100">
								<td class="whitespace-nowrap px-3 py-2">{datetimeLabel(row.created_at)}</td>
								<td class="whitespace-nowrap px-3 py-2 font-semibold">{formatMoney(row.amount_cents)}</td>
								<td class="whitespace-nowrap px-3 py-2">{methodLabel(row.payment_method)}</td>
								<td class="px-3 py-2 text-slate-600">{row.comment ?? '—'}</td>
								<td class="px-3 py-2 text-right">
									<button
										type="button"
										onclick={() => void removeExpense(row.id)}
										class="h-11 min-w-11 rounded-md px-3 text-rose-600"
									>
										Удалить
									</button>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="px-3 py-4 text-slate-500">Расходов пока нет</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="grid grid-cols-2 gap-2 text-sm">
				<div class="rounded-md bg-white p-3">
					<p class="text-xs text-slate-500">Итого расходы</p>
					<p class="font-semibold">{formatMoney(openShift.expenses_cents)}</p>
				</div>
				<div class="rounded-md bg-white p-3">
					<p class="text-xs text-slate-500">Итоговая сумма</p>
					<p class="font-semibold">{formatMoney(openShift.net_cents)}</p>
				</div>
			</div>
		</section>
	{:else}
		<button
			type="button"
			onclick={() => void openNewShift()}
			class="h-10 w-full rounded-md bg-emerald-600 text-sm font-semibold text-white"
		>
			Открыть смену
		</button>
	{/if}

	<h2 class="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Закрытые смены</h2>
	<ul class="space-y-2">
		{#each closedShifts as shift}
			<li class="overflow-hidden rounded-md border border-slate-200 bg-white">
				<button
					type="button"
					onclick={() => (expanded = expanded === shift.id ? null : shift.id)}
					class="w-full px-4 py-3 text-left"
				>
					<div class="flex items-center justify-between gap-2">
						<div>
							<p class="font-semibold">Смена №{shift.id}</p>
							<p class="text-xs text-slate-500">
								{datetimeLabel(shift.opened_at)} — {datetimeLabel(shift.closed_at)}
							</p>
						</div>
						<span class="text-lg">{expanded === shift.id ? '▴' : '▾'}</span>
					</div>
					<div class="mt-3 grid grid-cols-2 gap-2 text-sm">
						<div class="rounded bg-slate-100 p-2">
							<p class="text-xs text-slate-500">Чеков</p>
							<p class="font-semibold">{shift.orders_count}</p>
						</div>
						<div class="rounded bg-slate-100 p-2">
							<p class="text-xs text-slate-500">Выручка</p>
							<p class="font-semibold">{formatMoney(shift.revenue_cents)}</p>
						</div>
						<div class="rounded bg-slate-100 p-2">
							<p class="text-xs text-slate-500">Расходы</p>
							<p class="font-semibold">{formatMoney(shift.expenses_cents)}</p>
						</div>
						<div class="rounded bg-slate-100 p-2">
							<p class="text-xs text-slate-500">Итого</p>
							<p class="font-semibold">{formatMoney(shift.net_cents)}</p>
						</div>
					</div>
				</button>

				{#if expanded === shift.id}
					<div class="space-y-3 border-t border-slate-200 p-4">
						<div class="grid grid-cols-2 gap-2 text-sm">
							<div class="rounded bg-slate-100 p-3">
								<p class="text-slate-500">Касса</p>
								<p class="font-semibold">{formatMoney(shift.cash_cents)}</p>
							</div>
							<div class="rounded bg-slate-100 p-3">
								<p class="text-slate-500">Банк</p>
								<p class="font-semibold">{formatMoney(shift.cashless_cents)}</p>
							</div>
						</div>

						{#if shift.z}
							{#if shift.z.by_halls.length > 0}
								<div>
									<p class="text-xs font-semibold uppercase text-slate-500">По залам</p>
									<ul class="mt-1 space-y-1 text-sm">
										{#each shift.z.by_halls as hall}
											<li class="flex justify-between">
												<span>{hall.name}</span>
												<span>{formatMoney(hall.cents)}</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if shift.z.by_waiters.length > 0}
								<div>
									<p class="text-xs font-semibold uppercase text-slate-500">По официантам</p>
									<ul class="mt-1 space-y-1 text-sm">
										{#each shift.z.by_waiters as waiter}
											<li class="flex justify-between">
												<span>{waiter.name}</span>
												<span>{formatMoney(waiter.cents)}</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						{:else}
							<p class="text-sm text-slate-500">Z-отчёт отсутствует</p>
						{/if}

						<div>
							<p class="text-xs font-semibold uppercase text-slate-500">Расходы</p>
							<ul class="mt-1 space-y-1 text-sm">
								{#each shift.expenses as row}
									<li class="flex justify-between gap-2">
										<span class="text-slate-600">
											{datetimeLabel(row.created_at)} · {methodLabel(row.payment_method)}
											{#if row.comment}
												· {row.comment}
											{/if}
										</span>
										<span class="shrink-0 font-medium">{formatMoney(row.amount_cents)}</span>
									</li>
								{:else}
									<li class="text-slate-500">Расходов не было</li>
								{/each}
							</ul>
						</div>

						<button
							type="button"
							onclick={() => void exportZ(shift.id)}
							class="h-10 w-full rounded-md bg-emerald-700 text-sm font-semibold text-white"
						>
							Выгрузить Z-отчёт в Excel
						</button>
					</div>
				{/if}
			</li>
		{:else}
			<li class="text-slate-500">Закрытых смен пока нет</li>
		{/each}
	</ul>
</div>

{#if target}
	<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
		<div class="w-full max-w-md rounded-md border border-slate-300 bg-slate-100 p-4">
			<p class="font-semibold">Подтверждение отмены</p>
			<p class="mt-1 text-sm text-slate-700">
				Заказ №{target.id} ({target.waiter_name}) — {formatMoney(target.total_cents)}
			</p>
			<p class="mt-3 text-sm text-slate-500">Причина (обязательно)</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each [...presets, 'Другое'] as option}
					<button
						type="button"
						onclick={() => (preset = option)}
						class="h-11 rounded-md px-3 text-sm {preset === option ? 'bg-emerald-600 text-white' : 'bg-white'}"
					>
						{option}
					</button>
				{/each}
			</div>
			{#if preset === 'Другое'}
				<textarea
					bind:value={customReason}
					class="mt-3 min-h-20 w-full rounded-md bg-white p-3 text-sm"
					placeholder="Опиши причину"
				></textarea>
			{/if}
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button type="button" onclick={() => (target = null)} class="h-10 rounded-md bg-white text-sm">Отмена</button>
				<button
					type="button"
					onclick={confirmCancel}
					disabled={submitting}
					class="h-10 rounded-md bg-rose-700 text-sm text-white font-semibold disabled:opacity-50"
				>
					Подтвердить отмену
				</button>
			</div>
		</div>
	</div>
{/if}
