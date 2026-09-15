<script lang="ts">
	import PinPad from '$lib/components/PinPad.svelte';
	import { currencySymbol, formatMoney, parseMoney } from '$lib/money';

	type PayGuest = { id: number; name: string; is_paid: number };

	let {
		guests,
		payGuestId = $bindable(),
		cashlessIn = $bindable(),
		cashIn = $bindable(),
		guestTotal,
		hallQrPath,
		error = null,
		onClose,
		onConfirm
	}: {
		guests: PayGuest[];
		payGuestId: number | null;
		cashlessIn: string;
		cashIn: string;
		guestTotal: (id: number) => number;
		hallQrPath: string | null;
		error?: string | null;
		onClose: () => void;
		onConfirm: () => void;
	} = $props();

	let active = $state<'cashless' | 'cash'>('cashless');

	const unpaid = $derived(guests.filter((g) => !g.is_paid));
	const total = $derived(payGuestId != null ? guestTotal(payGuestId) : 0);

	const cashlessCents = $derived(parseMoney(cashlessIn) || 0);
	const cashCents = $derived(parseMoney(cashIn) || 0);
	const card = $derived(Math.min(Math.max(cashlessCents, 0), total));
	const remaining = $derived(total - card);
	const cashApplied = $derived(Math.min(Math.max(cashCents, 0), remaining));
	const collected = $derived(card + cashApplied);
	const change = $derived(cashCents - cashApplied);
	const shortfall = $derived(total - collected);

	function imageUrl(path: string | null): string {
		return path ? `/api/uploads/${path}` : '';
	}
</script>

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
	<div class="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-md border border-slate-300 bg-slate-100">
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
			<p class="text-lg font-bold">Оплата</p>
			{#if unpaid.length > 1}
				<p class="mt-4 text-sm text-slate-500">Кого считаем?</p>
				<div class="mt-3 space-y-2">
					{#each unpaid as guest}
						<button
							type="button"
							onclick={() => (payGuestId = guest.id)}
							class="h-12 w-full rounded-md border text-base font-semibold {payGuestId === guest.id
								? 'border-emerald-800 bg-emerald-600 text-white'
								: 'border-slate-300 bg-white text-slate-800'}"
						>
							{guest.name} — {formatMoney(guestTotal(guest.id))}
						</button>
					{/each}
				</div>
			{/if}

			{#if payGuestId}
				<p class="mt-4 text-center text-3xl font-bold text-emerald-700">{formatMoney(total)}</p>
			{/if}

			{#if hallQrPath && (active === 'cashless' || cashlessCents > 0)}
				<img src={imageUrl(hallQrPath)} alt="QR для оплаты" class="mt-3 w-full object-contain" />
			{/if}

			<div class="mt-4 space-y-2">
				<button
					type="button"
					onclick={() => (active = 'cashless')}
					class="flex h-12 w-full items-center justify-between rounded-md border px-4 {active === 'cashless'
						? 'border-emerald-800 bg-white'
						: 'border-slate-300 bg-slate-50'}"
				>
					<span class="text-sm font-semibold text-slate-600">Безнал</span>
					<span class="font-mono text-lg">{cashlessIn || '0'} {currencySymbol()}</span>
				</button>
				<button
					type="button"
					onclick={() => (active = 'cash')}
					class="flex h-12 w-full items-center justify-between rounded-md border px-4 {active === 'cash'
						? 'border-emerald-800 bg-white'
						: 'border-slate-300 bg-slate-50'}"
				>
					<span class="text-sm font-semibold text-slate-600">Наличными</span>
					<span class="font-mono text-lg">{cashIn || '0'} {currencySymbol()}</span>
				</button>
			</div>

			<p class="mt-2 text-sm text-slate-500">
				{active === 'cashless' ? 'Вводим безнал' : 'Вводим внесено наличными'}
			</p>
			<div class="mt-3">
				{#if active === 'cashless'}
					<PinPad bind:value={cashlessIn} maxLength={10} />
				{:else}
					<PinPad bind:value={cashIn} maxLength={10} />
				{/if}
			</div>

			{#if change > 0}
				<p class="mt-3 text-emerald-600">Сдача: {formatMoney(change)}</p>
			{:else if shortfall > 0}
				<p class="mt-3 font-semibold text-amber-600">Недоплата: {formatMoney(shortfall)}</p>
			{/if}

			{#if error}
				<p class="mt-3 text-center text-sm text-rose-600">{error}</p>
			{/if}
		</div>

		<div class="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 p-4">
			<button
				type="button"
				class="h-12 rounded-md border border-slate-300 bg-white text-base font-bold text-slate-800"
				onclick={onClose}>Закрыть</button
			>
			<button
				type="button"
				class="h-12 rounded-md border border-emerald-800 bg-emerald-600 text-base font-bold text-white disabled:opacity-50"
				disabled={collected <= 0}
				onclick={onConfirm}>Оплачено</button
			>
		</div>
	</div>
</div>
