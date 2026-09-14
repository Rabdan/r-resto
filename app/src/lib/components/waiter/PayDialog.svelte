<script lang="ts">
	import PinPad from '$lib/components/PinPad.svelte';
	import { currencySymbol, formatMoney, parseMoney } from '$lib/money';

	type PayGuest = { id: number; name: string; is_paid: number };

	let {
		guests,
		payGuestId = $bindable(),
		payMethod = $bindable(),
		cashIn = $bindable(),
		guestTotal,
		hallQrPath,
		error = null,
		onClose,
		onConfirm
	}: {
		guests: PayGuest[];
		payGuestId: number | null;
		payMethod: 'cash' | 'cashless';
		cashIn: string;
		guestTotal: (id: number) => number;
		hallQrPath: string | null;
		error?: string | null;
		onClose: () => void;
		onConfirm: () => void;
	} = $props();

	const unpaid = $derived(guests.filter((g) => !g.is_paid));
	const amount = $derived(payGuestId != null ? guestTotal(payGuestId) : 0);

	function imageUrl(path: string | null): string {
		return path ? `/api/uploads/${path}` : '';
	}

	function setMethod(next: 'cash' | 'cashless') {
		payMethod = next;
		if (next === 'cashless') cashIn = '';
	}
</script>

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
	<div class="w-full max-w-sm rounded-md border border-slate-300 bg-slate-100 p-4">
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

		<p class="mt-4 text-sm font-semibold text-slate-500">Способ оплаты</p>
		<div
			class="mt-3 flex gap-1 rounded-lg border border-slate-500 bg-white p-1.5"
			role="radiogroup"
			aria-label="Способ оплаты"
		>
			<button
				type="button"
				role="radio"
				aria-checked={payMethod === 'cashless'}
				class="h-12 flex-1 rounded-md border text-base font-bold {payMethod === 'cashless'
					? 'border-emerald-800 bg-emerald-600 text-white'
					: 'border-slate-300 bg-slate-50 text-slate-600'}"
				onclick={() => setMethod('cashless')}>Безнал</button
			>
			<button
				type="button"
				role="radio"
				aria-checked={payMethod === 'cash'}
				class="h-12 flex-1 rounded-md border text-base font-bold {payMethod === 'cash'
					? 'border-emerald-800 bg-emerald-600 text-white'
					: 'border-slate-300 bg-slate-50 text-slate-600'}"
				onclick={() => setMethod('cash')}>Наличные</button
			>
		</div>
		<p class="mt-3 text-center text-sm font-semibold text-slate-600">
			{payMethod === 'cashless' ? 'Сейчас: безнал' : 'Сейчас: наличные'}
		</p>

		{#if payMethod === 'cashless'}
			{#if hallQrPath}
				<img src={imageUrl(hallQrPath)} alt="QR для оплаты" class="mx-auto mt-4 h-80 w-80 object-contain" />
			{/if}
			{#if payGuestId}
				<p class="mt-3 text-center text-3xl font-bold text-emerald-700">{formatMoney(amount)}</p>
			{/if}
		{:else}
			{#if payGuestId}
				<p class="mt-3 text-3xl font-bold text-emerald-700">{formatMoney(amount)}</p>
			{/if}
			<p class="mt-4 text-sm text-slate-500">Внесено, {currencySymbol()}</p>
			<p class="font-mono text-2xl">{cashIn || '0'}</p>
			<div class="mt-3">
				<PinPad bind:value={cashIn} maxLength={10} />
			</div>
			{#if payGuestId && parseMoney(cashIn) >= amount}
				<p class="mt-3 text-emerald-600">Сдача: {formatMoney(parseMoney(cashIn) - amount)}</p>
			{/if}
		{/if}

		{#if error}
			<p class="mt-3 text-center text-sm text-rose-600">{error}</p>
		{/if}

		<div class="mt-4 grid grid-cols-2 gap-2">
			<button
				type="button"
				class="h-12 rounded-md border border-slate-300 bg-white text-base font-bold text-slate-800"
				onclick={onClose}>Закрыть</button
			>
			<button
				type="button"
				class="h-12 rounded-md border border-emerald-800 bg-emerald-600 text-base font-bold text-white"
				onclick={onConfirm}>Оплачено</button
			>
		</div>
	</div>
</div>
