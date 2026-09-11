<script lang="ts">
	import { onMount } from 'svelte';
	import { formatMoney } from '$lib/money';

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
	};

	let shifts = $state<Shift[]>([]);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);
	let expanded = $state<number | null>(null);

	const openShift = $derived(shifts.find((s) => s.status === 'open') ?? null);

	onMount(() => {
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
		message = `Смена закрыта, Z-отчёт сформирован`;
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

	function datetimeLabel(dbTime: string | null | undefined): string {
		if (!dbTime) return '—';
		const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dbTime);
		if (!m) return dbTime;
		return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}`;
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
				class="mt-3 h-12 w-full rounded-md bg-rose-600 font-semibold text-white"
			>
				Закрыть смену и сформировать Z-отчёт
			</button>
		</div>
	{:else}
		<button
			type="button"
			onclick={() => void openNewShift()}
			class="h-12 w-full rounded-md bg-emerald-600 font-semibold text-white"
		>
			Открыть смену
		</button>
	{/if}

	<h2 class="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Закрытые смены</h2>
	<ul class="space-y-2">
		{#each shifts.filter((s) => s.status === 'closed') as shift}
			<li class="overflow-hidden rounded-md border border-slate-200 bg-white">
				<button
					type="button"
					onclick={() => (expanded = expanded === shift.id ? null : shift.id)}
					class="flex h-14 w-full items-center justify-between px-4 text-left"
				>
					<div>
						<p class="font-semibold">Смена №{shift.id}</p>
						<p class="text-xs text-slate-500">
							{datetimeLabel(shift.opened_at)} — {datetimeLabel(shift.closed_at)}
						</p>
					</div>
					<span class="text-lg">{expanded === shift.id ? '▴' : '▾'}</span>
				</button>

				{#if expanded === shift.id}
					<div class="space-y-3 border-t border-slate-200 p-4">
						{#if shift.z}
							<div class="grid grid-cols-2 gap-2 text-sm">
								<div class="rounded bg-slate-100 p-3">
									<p class="text-slate-500">Чеков</p>
									<p class="font-semibold">{shift.z.orders_count}</p>
								</div>
								<div class="rounded bg-slate-100 p-3">
									<p class="text-slate-500">Итого</p>
									<p class="font-semibold">{formatMoney(shift.z.total_cents)}</p>
								</div>
								<div class="rounded bg-slate-100 p-3">
									<p class="text-slate-500">Наличные</p>
									<p class="font-semibold">{formatMoney(shift.z.cash_cents)}</p>
								</div>
								<div class="rounded bg-slate-100 p-3">
									<p class="text-slate-500">Безнал</p>
									<p class="font-semibold">{formatMoney(shift.z.cashless_cents)}</p>
								</div>
							</div>

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

						<button
							type="button"
							onclick={() => void exportZ(shift.id)}
							class="h-12 w-full rounded-md bg-emerald-700 font-semibold text-white"
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
