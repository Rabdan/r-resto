<script lang="ts">
	import { onMount } from 'svelte';
	import { formatMoney } from '$lib/money';

	type Item = { title: string; quantity: number; price_cents: number; status: string };
	type Guest = { name: string; is_paid: number };
	type OpenPrecheck = {
		id: number;
		created_at: string;
		waiter_name: string;
		hall_name: string;
		total_cents: number;
		items: Item[];
		guests: Guest[];
	};
	type ClosedPrecheck = {
		id: number;
		created_at: string;
		closed_at: string | null;
		waiter_name: string;
		hall_name: string;
		total_cents: number;
	};
	type CancelledPrecheck = {
		id: number;
		created_at: string;
		cancelled_at: string | null;
		cancel_reason: string | null;
		waiter_name: string;
		cancelled_by: string | null;
		total_cents: number;
	};

	const presets = ['Ошибка ввода', 'Отказ гостя'];

	type Tab = 'active' | 'closed' | 'cancelled' | 'all';

	const TABS: Array<{ key: Tab; label: string }> = [
		{ key: 'active', label: 'Активные' },
		{ key: 'closed', label: 'Закрытые' },
		{ key: 'cancelled', label: 'Отменённые' },
		{ key: 'all', label: 'Все' }
	];

	let tab = $state<Tab>('active');
	let open = $state<OpenPrecheck[]>([]);
	let closed = $state<ClosedPrecheck[]>([]);
	let cancelled = $state<CancelledPrecheck[]>([]);
	let error = $state<string | null>(null);
	let target = $state<OpenPrecheck | null>(null);
	let preset = $state(presets[0]);
	let customReason = $state('');
	let submitting = $state(false);

	onMount(() => {
		void load();
	});

	async function load() {
		error = null;
		const res = await fetch('/api/admin/prechecks');
		if (!res.ok) {
			error = 'Не удалось загрузить пречеки';
			return;
		}
		const data = await res.json();
		open = data.open ?? [];
		closed = data.closed ?? [];
		cancelled = data.cancelled ?? [];
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
		const res = await fetch(`/api/admin/prechecks/${target.id}/cancel`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reason })
		});
		submitting = false;
		if (!res.ok) {
			error = 'Не удалось отменить пречек';
			return;
		}
		target = null;
		customReason = '';
		preset = presets[0];
		await load();
	}
</script>

<header class="bg-slate-50 px-4 py-3 font-semibold">Чеки</header>
<div class="space-y-4 px-4 py-4">
	<div class="grid grid-cols-4 gap-2">
		{#each TABS as tabItem}
			<button
				type="button"
				onclick={() => (tab = tabItem.key)}
				class="h-12 rounded-md text-sm font-semibold {tab === tabItem.key
					? 'bg-emerald-600 text-white'
					: 'bg-white text-slate-700'}"
			>
				{tabItem.label}
			</button>
		{/each}
	</div>

	{#if error}
		<p class="text-sm text-rose-600">{error}</p>
	{/if}

	{#if tab === 'active'}
		{#each open as precheck}
			<article class="rounded-md border border-slate-200 bg-white p-4">
				<div class="flex items-start justify-between gap-2">
					<div>
						<p class="font-semibold">Пречек №{precheck.id}</p>
						<p class="text-sm text-slate-500">
							{precheck.waiter_name} · {precheck.hall_name}
						</p>
						<p class="text-xs text-slate-500">{precheck.created_at}</p>
					</div>
					<p class="font-semibold">{formatMoney(precheck.total_cents)}</p>
				</div>
				<p class="mt-2 text-sm text-slate-700">
					Гости: {precheck.guests.map((g) => g.name).join(', ') || '—'}
				</p>
				<ul class="mt-2 space-y-1 text-sm text-slate-700">
					{#each precheck.items as item}
						<li>{item.quantity}× {item.title} — {formatMoney(item.price_cents * item.quantity)}</li>
					{:else}
						<li class="text-slate-500">Позиций нет</li>
					{/each}
				</ul>
				<button
					type="button"
					onclick={() => {
						target = precheck;
						error = null;
					}}
					class="mt-3 h-12 w-full rounded-md bg-rose-100 font-semibold text-rose-700"
				>
					Отменить пречек
				</button>
			</article>
		{:else}
			<p class="text-slate-500">Нет открытых пречеков</p>
		{/each}
	{:else if tab === 'closed'}
		<ul class="space-y-2">
			{#each closed as precheck}
				<li class="rounded-md border border-slate-200 bg-white p-3">
					<div class="flex justify-between gap-2">
						<span class="font-semibold">Чек №{precheck.id}</span>
						<span class="font-semibold">{formatMoney(precheck.total_cents)}</span>
					</div>
					<p class="text-sm text-slate-500">{precheck.waiter_name} · {precheck.hall_name}</p>
					<p class="text-xs text-slate-500">Закрыт: {precheck.closed_at ?? '—'}</p>
				</li>
			{:else}
				<li class="text-slate-500">Нет закрытых чеков</li>
			{/each}
		</ul>
	{:else if tab === 'cancelled'}
		<ul class="space-y-2">
			{#each cancelled as precheck}
				<li class="rounded-md border border-slate-200 bg-slate-100 p-3 text-sm">
					<div class="flex justify-between">
						<span class="font-medium">№{precheck.id}</span>
						<span>{formatMoney(precheck.total_cents)}</span>
					</div>
					<p class="text-slate-500">{precheck.waiter_name} · {precheck.cancelled_by ?? 'админ'}</p>
					<p class="text-rose-600">{precheck.cancel_reason}</p>
				</li>
			{:else}
				<li class="text-slate-500">Пока нет отмен</li>
			{/each}
		</ul>
	{:else}
		<ul class="space-y-2">
			{#each open as precheck}
				<li class="rounded-md border border-slate-200 bg-white p-3">
					<div class="flex justify-between gap-2">
						<span class="font-semibold">Пречек №{precheck.id}</span>
						<span class="font-semibold">{formatMoney(precheck.total_cents)}</span>
					</div>
					<p class="text-sm text-slate-500">{precheck.waiter_name} · {precheck.hall_name}</p>
					<p class="text-xs text-emerald-600">активен</p>
				</li>
			{/each}
			{#each closed as precheck}
				<li class="rounded-md border border-slate-200 bg-white p-3">
					<div class="flex justify-between gap-2">
						<span class="font-semibold">Чек №{precheck.id}</span>
						<span class="font-semibold">{formatMoney(precheck.total_cents)}</span>
					</div>
					<p class="text-sm text-slate-500">{precheck.waiter_name} · {precheck.hall_name}</p>
					<p class="text-xs text-slate-500">закрыт</p>
				</li>
			{/each}
			{#each cancelled as precheck}
				<li class="rounded-md border border-slate-200 bg-slate-100 p-3">
					<div class="flex justify-between gap-2">
						<span class="font-semibold">№{precheck.id}</span>
						<span class="font-semibold">{formatMoney(precheck.total_cents)}</span>
					</div>
					<p class="text-sm text-slate-500">{precheck.waiter_name}</p>
					<p class="text-xs text-rose-600">отменён</p>
				</li>
			{/each}
			{#if open.length === 0 && closed.length === 0 && cancelled.length === 0}
				<li class="text-slate-500">Чеков нет</li>
			{/if}
		</ul>
	{/if}
</div>

{#if target}
	<div class="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
		<div class="w-full max-w-md rounded-md border border-slate-300 bg-slate-100 p-4">
			<p class="font-semibold">Подтверждение отмены</p>
			<p class="mt-1 text-sm text-slate-700">
				Пречек №{target.id} ({target.waiter_name}) — {formatMoney(target.total_cents)}
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
				<button type="button" onclick={() => (target = null)} class="h-12 rounded-md bg-white">Отмена</button>
				<button
					type="button"
					onclick={confirmCancel}
					disabled={submitting}
					class="h-12 rounded-md bg-rose-700 text-white font-semibold disabled:opacity-50"
				>
					Подтвердить отмену
				</button>
			</div>
		</div>
	</div>
{/if}
