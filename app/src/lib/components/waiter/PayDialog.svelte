<script lang="ts">
	import PinPad from '$lib/components/PinPad.svelte';
	import { currencySymbol, formatMoney, parseMoney } from '$lib/money';

	type PayGuest = { id: number; name: string; is_paid: number; paid_cents: number };

	let {
		guests,
		payGuestId = $bindable(),
		guestTotal,
		hallQrPath,
		error = null,
		onClose,
		onConfirm,
		onRefund,
		onCloseOrder
	}: {
		guests: PayGuest[];
		payGuestId: number | null;
		guestTotal: (id: number) => number;
		hallQrPath: string | null;
		error?: string | null;
		onClose: () => void;
		onConfirm: (p: { cashlessCents: number; cashReceivedCents: number }) => void;
		onRefund: (guestId: number) => void;
		onCloseOrder?: () => void;
	} = $props();

	let mode = $state<'full' | 'partial'>('full');
	let fullMethod = $state<'cashless' | 'cash' | 'none'>('none');
	let cashlessIn = $state('');
	let cashIn = $state('');
	let activeField = $state<'cashless' | 'cash'>('cashless');
	let confirmOpen = $state(false);
	let refundOpen = $state(false);

	const owing = $derived(guests.filter((g) => guestTotal(g.id) !== g.paid_cents));
	const total = $derived(payGuestId != null ? guestTotal(payGuestId) : 0);
	const paidCents = $derived(
		payGuestId != null ? (guests.find((g) => g.id === payGuestId)?.paid_cents ?? 0) : 0
	);
	const due = $derived(total - paidCents);

	const cashlessCents = $derived(parseMoney(cashlessIn) || 0);
	const cashCents = $derived(parseMoney(cashIn) || 0);

	const card = $derived(Math.min(Math.max(cashlessCents, 0), Math.max(due, 0)));
	const remainingAfterCard = $derived(Math.max(due, 0) - card);
	const cashApplied = $derived(Math.min(Math.max(cashCents, 0), remainingAfterCard));
	const collected = $derived(card + cashApplied);
	const change = $derived(cashCents - cashApplied);
	const stillDue = $derived(Math.max(due, 0) - collected);
	const fullCashChange = $derived(Math.max(0, cashCents - Math.max(due, 0)));

	const payAmount = $derived(mode === 'full' ? Math.max(due, 0) : collected);

	const confirmEnabled = $derived(
		mode === 'full' ? (fullMethod === 'none' ? false : due > 0) : collected > 0
	);

	function imageUrl(path: string | null): string {
		return path ? `/api/uploads/${path}` : '';
	}

	function toggleMode() {
		mode = mode === 'full' ? 'partial' : 'full';
		cashlessIn = '';
		cashIn = '';
		fullMethod = 'none';
	}

	function setFullMethod(next: 'cashless' | 'cash' | 'none') {
		fullMethod = next;
		cashlessIn = '';
		cashIn = '';
	}

	function confirm() {
		if (!confirmEnabled) return;
		confirmOpen = true;
	}

	function applyPayment() {
		confirmOpen = false;
		if (mode === 'full') {
			if (fullMethod === 'cashless') onConfirm({ cashlessCents: due, cashReceivedCents: 0 });
			else if (fullMethod === 'cash')
				onConfirm({ cashlessCents: 0, cashReceivedCents: Math.max(cashCents, due) });
			return;
		}
		onConfirm({ cashlessCents: cashlessCents, cashReceivedCents: cashCents });
	}

	function confirmRefund() {
		if (payGuestId == null) return;
		refundOpen = false;
		onRefund(payGuestId);
	}
</script>

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
	<div class="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-md border border-slate-300 bg-slate-100">
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
			<p class="text-lg font-bold">Оплата</p>

			{#if owing.length > 1}
				<p class="mt-4 text-sm text-slate-500">Кого считаем?</p>
				<div class="mt-3 space-y-2">
					{#each owing as guest}
						{@const diff = guestTotal(guest.id) - guest.paid_cents}
						<button
							type="button"
							onclick={() => (payGuestId = guest.id)}
							class="h-12 w-full rounded-md border text-base font-semibold {payGuestId === guest.id
								? 'border-emerald-800 bg-emerald-600 text-white'
								: 'border-slate-300 bg-white text-slate-800'}"
						>
							{guest.name} — {diff > 0 ? formatMoney(diff) : `возврат ${formatMoney(-diff)}`}
						</button>
					{/each}
				</div>
			{/if}

			{#if payGuestId && due < 0}
				<p class="mt-4 text-center text-3xl font-bold text-rose-600">Возврат {formatMoney(-due)}</p>
				<p class="mt-1 text-center text-sm text-slate-500">
					Оплачено {formatMoney(paidCents)} · Сумма {formatMoney(total)}
				</p>
			{:else if payGuestId}
				<p class="mt-4 text-center text-3xl font-bold text-emerald-700">{formatMoney(due)}</p>
				{#if paidCents > 0}
					<p class="mt-1 text-center text-sm text-slate-500">Уже оплачено: {formatMoney(paidCents)}</p>
				{/if}

				{#if mode === 'full'}
					<div
						class="mt-4 flex gap-1 rounded-lg border border-slate-500 bg-white p-1.5"
						role="radiogroup"
						aria-label="Способ оплаты"
					>
						<button
							type="button"
							role="radio"
							aria-checked={fullMethod === 'cash'}
							class="h-12 flex-1 rounded-md border text-base font-bold {fullMethod === 'cash'
								? 'border-emerald-800 bg-emerald-600 text-white'
								: 'border-slate-300 bg-slate-50 text-slate-600'}"
							onclick={() => setFullMethod('cash')}>Наличные</button
						>
						<button
							type="button"
							role="radio"
							aria-checked={fullMethod === 'none'}
							class="h-12 flex-1 rounded-md border text-base font-bold {fullMethod === 'none'
								? 'border-slate-700 bg-slate-600 text-white'
								: 'border-slate-300 bg-slate-50 text-slate-600'}"
							onclick={() => setFullMethod('none')}>Нет</button
						>
						<button
							type="button"
							role="radio"
							aria-checked={fullMethod === 'cashless'}
							class="h-12 flex-1 rounded-md border text-base font-bold {fullMethod === 'cashless'
								? 'border-emerald-800 bg-emerald-600 text-white'
								: 'border-slate-300 bg-slate-50 text-slate-600'}"
							onclick={() => setFullMethod('cashless')}>Безнал</button
						>
					</div>

					{#if fullMethod === 'cashless'}
						{#if hallQrPath}
							<img src={imageUrl(hallQrPath)} alt="QR для оплаты" class="mt-3 w-full object-contain" />
						{/if}
					{:else if fullMethod === 'cash'}
						<p class="mt-4 text-sm font-semibold text-slate-600">Калькулятор для расчета сдачи</p>
						<p class="mt-1 text-sm text-slate-500">Внесено, {currencySymbol()}</p>
						<p class="font-mono text-2xl">{cashIn || '0'}</p>
						<div class="mt-3">
							<PinPad bind:value={cashIn} maxLength={10} />
						</div>
						{#if fullCashChange > 0}
							<p class="mt-3 text-emerald-600">Сдача: {formatMoney(fullCashChange)}</p>
						{/if}
					{/if}
				{:else}
					<div class="mt-4 space-y-2">
						<button
							type="button"
							onclick={() => (activeField = 'cashless')}
							class="flex h-12 w-full items-center justify-between rounded-md border px-4 {activeField ===
							'cashless'
								? 'border-emerald-800 bg-white'
								: 'border-slate-300 bg-slate-50'}"
						>
							<span class="text-sm font-semibold text-slate-600">Безнал</span>
							<span class="font-mono text-lg">{cashlessIn || '0'} {currencySymbol()}</span>
						</button>
						<button
							type="button"
							onclick={() => (activeField = 'cash')}
							class="flex h-12 w-full items-center justify-between rounded-md border px-4 {activeField ===
							'cash'
								? 'border-emerald-800 bg-white'
								: 'border-slate-300 bg-slate-50'}"
						>
							<span class="text-sm font-semibold text-slate-600">Наличными</span>
							<span class="font-mono text-lg">{cashIn || '0'} {currencySymbol()}</span>
						</button>
					</div>

					<p class="mt-2 text-sm text-slate-500">
						{activeField === 'cashless' ? 'Вводим безнал' : 'Вводим внесено наличными'}
					</p>
					<div class="mt-3">
						{#if activeField === 'cashless'}
							<PinPad bind:value={cashlessIn} maxLength={10} />
						{:else}
							<PinPad bind:value={cashIn} maxLength={10} />
						{/if}
					</div>

					{#if change > 0}
						<p class="mt-3 text-emerald-600">Сдача: {formatMoney(change)}</p>
					{/if}
					<p class="mt-3 text-base font-semibold {stillDue > 0 ? 'text-amber-600' : 'text-emerald-600'}">
						еще {formatMoney(stillDue)}
					</p>
				{/if}
			{/if}

			{#if error}
				<p class="mt-3 text-center text-sm text-rose-600">{error}</p>
			{/if}
		</div>

		<div
			class="grid shrink-0 gap-2 border-t border-slate-200 p-4 {payGuestId == null
				? 'grid-cols-1'
				: due < 0
					? 'grid-cols-2'
					: 'grid-cols-3'}"
		>
			<button
				type="button"
				class="h-12 rounded-md border border-slate-300 bg-white text-base font-bold text-slate-800"
				onclick={onClose}>Отмена</button
			>
			{#if payGuestId && due < 0}
				<button
					type="button"
					class="h-12 rounded-md border border-rose-700 bg-rose-600 text-base font-bold text-white"
					onclick={() => (refundOpen = true)}>Вернуть</button
				>
			{:else if payGuestId}
				<button
					type="button"
					class="h-12 rounded-md border border-slate-500 bg-white text-sm font-bold text-slate-700"
					onclick={toggleMode}>{mode === 'full' ? 'Частично' : 'Полная'}</button
				>
				<button
					type="button"
					class="h-12 rounded-md border border-emerald-800 bg-emerald-600 text-base font-bold text-white disabled:opacity-50"
					disabled={!confirmEnabled}
					onclick={confirm}>Оплата</button
				>
			{/if}
		</div>
		{#if onCloseOrder}
			<button
				type="button"
				class="h-12 w-full shrink-0 rounded-md border border-rose-300 bg-rose-50 text-base font-bold text-rose-700"
				onclick={onCloseOrder}
			>
				Закрыть заказ
			</button>
		{/if}
	</div>
</div>

{#if confirmOpen}
	<div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="w-full max-w-sm rounded-md border border-slate-300 bg-slate-100 p-4">
			<p class="text-lg font-bold">Подтверждение оплаты</p>
			<p class="mt-2 text-base text-slate-700">Поступила оплата {formatMoney(payAmount)}?</p>
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button
					type="button"
					class="h-12 rounded-md border border-slate-300 bg-white text-base font-bold text-slate-800"
					onclick={() => (confirmOpen = false)}>Нет</button
				>
				<button
					type="button"
					class="h-12 rounded-md border border-emerald-800 bg-emerald-600 text-base font-bold text-white"
					onclick={applyPayment}>Да</button
				>
			</div>
		</div>
	</div>
{/if}

{#if refundOpen}
	<div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="w-full max-w-sm rounded-md border border-slate-300 bg-slate-100 p-4">
			<p class="text-lg font-bold">Возврат</p>
			<p class="mt-2 text-base text-slate-700">Вернуть {formatMoney(-due)}?</p>
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button
					type="button"
					class="h-12 rounded-md border border-slate-300 bg-white text-base font-bold text-slate-800"
					onclick={() => (refundOpen = false)}>Нет</button
				>
				<button
					type="button"
					class="h-12 rounded-md border border-rose-700 bg-rose-600 text-base font-bold text-white"
					onclick={confirmRefund}>Да</button
				>
			</div>
		</div>
	</div>
{/if}
