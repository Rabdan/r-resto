<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { waiterSeesReady } from '$lib/item-ready';

	export type OrderLine = {
		id: number;
		guest_id: number;
		title: string;
		price_cents: number;
		quantity: number;
		status: string;
		is_custom: number;
		ready_at?: string | null;
	};
	export type OrderGuestChip = { id: number; name: string; is_paid?: number; shortfall_cents: number };

	let {
		guests,
		items,
		activeGuestId = null,
		splitMode = false,
		readOnly = false,
		orderReadyAt = null,
		onInc,
		onDec,
		onMove,
		onRename,
		onSelectGuest,
		onRemoveGuest
	}: {
		guests: OrderGuestChip[];
		items: OrderLine[];
		activeGuestId?: number | null;
		splitMode?: boolean;
		readOnly?: boolean;
		orderReadyAt?: string | null;
		onInc: (id: number) => void;
		onDec: (id: number) => void;
		onMove: (item: OrderLine, toGuestId: number) => void;
		onRename: (id: number, name: string) => void;
		onSelectGuest?: (id: number) => void;
		onRemoveGuest?: (id: number) => void;
	} = $props();

	let editingId = $state<number | null>(null);
	let nameDraft = $state('');
	let nameInput = $state<HTMLInputElement | null>(null);

	let pending = $state<OrderLine | null>(null);
	let dragItem = $state<OrderLine | null>(null);
	let dragArmed = $state(false);
	let dragOverGuestId = $state<number | null>(null);
	let pickedId = $state<number | null>(null);
	let pointerStart = { x: 0, y: 0 };
	let now = $state(Date.now());

	$effect(() => {
		const t = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(t);
	});

	$effect(() => {
		if (!splitMode) pickedId = null;
	});

	$effect(() => {
		if (editingId != null) {
			nameInput?.focus();
			nameInput?.select();
		}
	});

	const orderReady = $derived(waiterSeesReady('ready', orderReadyAt, now));

	function statusLabel(item: OrderLine): string {
		if (orderReady && (item.status === 'ready' || item.status === 'pending')) return 'Готов';
		if (item.status === 'ready' || item.status === 'pending') return 'На кухне';
		if (item.status === 'out_of_stock') return 'Нет блюда';
		return '';
	}

	function statusClass(item: OrderLine): string {
		if (orderReady && (item.status === 'ready' || item.status === 'pending')) {
			return 'font-semibold text-emerald-600';
		}
		if (item.status === 'out_of_stock') return 'font-semibold text-rose-600';
		return 'text-slate-500';
	}

	function guestTotal(id: number): number {
		return items
			.filter((i) => i.guest_id === id)
			.reduce((n, i) => n + i.quantity * i.price_cents, 0);
	}

	function guestItemCount(id: number): number {
		return items.filter((i) => i.guest_id === id).length;
	}

	function guestPaid(guestId: number): boolean {
		return guests.find((g) => g.id === guestId)?.is_paid === 1;
	}

	function isEditable(item: OrderLine): boolean {
		return (
			!readOnly &&
			!guestPaid(item.guest_id) &&
			(item.status === 'held' || item.status === 'pending' || item.status === 'ready')
		);
	}

	function canRemove(guest: OrderGuestChip): boolean {
		return (
			!readOnly &&
			!!onRemoveGuest &&
			guests.length > 1 &&
			!guest.is_paid &&
			guestItemCount(guest.id) === 0
		);
	}

	function startEdit(guest: OrderGuestChip, e?: Event) {
		e?.stopPropagation();
		if (readOnly) return;
		editingId = guest.id;
		nameDraft = guest.name;
	}

	function commitEdit(id: number) {
		editingId = null;
		onRename(id, nameDraft);
	}

	function onGuestTap(guest: OrderGuestChip) {
		if (readOnly) return;
		if (splitMode && pickedId != null) {
			const item = items.find((i) => i.id === pickedId);
			if (item && item.guest_id !== guest.id && !guest.is_paid) {
				onMove(item, guest.id);
			}
			pickedId = null;
			return;
		}
		onSelectGuest?.(guest.id);
	}

	function onPointerDown(e: PointerEvent, item: OrderLine) {
		if (readOnly) return;
		if ((e.target as HTMLElement).closest('button')) return;
		pending = item;
		pointerStart = { x: e.clientX, y: e.clientY };
		dragArmed = false;
		dragItem = null;
	}

	function dropTargetUnder(e: PointerEvent): number | null {
		const el = document.elementFromPoint(e.clientX, e.clientY);
		const host = el?.closest('[data-guest-drop]') as HTMLElement | null;
		if (!host) return null;
		const id = Number(host.getAttribute('data-guest-id'));
		return Number.isFinite(id) ? id : null;
	}

	function onPointerMove(e: PointerEvent) {
		if (!pending) return;
		const dx = e.clientX - pointerStart.x;
		const dy = e.clientY - pointerStart.y;
		if (!dragArmed && Math.hypot(dx, dy) < 12) return;
		if (splitMode) return;
		if (!dragArmed) {
			dragArmed = true;
			dragItem = pending;
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		}
		dragOverGuestId = dropTargetUnder(e);
	}

	function onPointerUp(e: PointerEvent) {
		if (splitMode && pending && !dragArmed) {
			pickedId = pickedId === pending.id ? null : pending.id;
			pending = null;
			return;
		}
		if (dragArmed && dragItem) {
			const target = dropTargetUnder(e);
			if (target != null && target !== dragItem.guest_id) onMove(dragItem, target);
		}
		pending = null;
		dragItem = null;
		dragArmed = false;
		dragOverGuestId = null;
	}
</script>

<div class="px-4 pb-4 pt-4">
	{#if splitMode && !readOnly}
		<p class="mb-3 text-sm font-semibold text-violet-700">
			{pickedId ? 'Выбери гостя, кому перенести' : 'Нажми позицию, затем гостя'}
		</p>
	{/if}
	{#each guests as guest}
		<div
			data-guest-drop
			data-guest-id={guest.id}
			class="flex items-center justify-between gap-2 border-t border-slate-200 py-3 {dragOverGuestId ===
			guest.id
				? 'ring-2 ring-emerald-500'
				: ''} {activeGuestId === guest.id && !guest.is_paid
				? 'bg-emerald-50'
				: 'bg-slate-50'}"
		>
			{#if editingId === guest.id}
				<input
					class="min-w-0 flex-1 rounded bg-white px-2 py-1 text-lg font-bold text-slate-900 outline-none"
					bind:this={nameInput}
					bind:value={nameDraft}
					onblur={() => commitEdit(guest.id)}
					onkeydown={(e) => {
						if (e.key === 'Enter') commitEdit(guest.id);
						if (e.key === 'Escape') editingId = null;
					}}
				/>
			{:else if readOnly}
				<p class="min-w-0 flex-1 text-left text-lg font-bold text-emerald-700">
					Гость: {guest.name}{#if guest.is_paid}<span class="ml-2 text-sm font-semibold text-slate-500"
							>оплачен</span
						>{/if}{#if guest.shortfall_cents > 0}<span
							class="ml-2 text-sm font-semibold text-amber-600">недоплата {formatMoney(guest.shortfall_cents)}</span
						>{/if}
				</p>
			{:else}
				<button
					type="button"
					class="min-w-0 flex-1 text-left text-lg font-bold {activeGuestId === guest.id
						? 'text-emerald-800'
						: guest.is_paid
							? 'text-slate-400'
							: 'text-emerald-700'}"
					onclick={() => onGuestTap(guest)}
				>
					Гость: {guest.name}{#if guest.is_paid}<span class="ml-2 text-sm font-semibold">оплачен</span
						>{/if}{#if guest.shortfall_cents > 0}<span
							class="ml-2 text-sm font-semibold text-amber-600">недоплата {formatMoney(guest.shortfall_cents)}</span
						>{/if}{#if activeGuestId === guest.id}<span
							class="ml-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">активен</span
						>{/if}
				</button>
				<button
					type="button"
					class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600"
					aria-label="Переименовать"
					onclick={(e) => startEdit(guest, e)}
				>
					✎
				</button>
				{#if canRemove(guest)}
					<button
						type="button"
						class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-lg font-bold text-rose-700"
						aria-label="Удалить гостя"
						onclick={() => onRemoveGuest?.(guest.id)}
					>
						✕
					</button>
				{/if}
			{/if}
			<span class="shrink-0 text-base font-bold text-rose-600">{formatMoney(guestTotal(guest.id))}</span>
		</div>
		{#each items.filter((i) => i.guest_id === guest.id) as item}
			<div
				role="button"
				tabindex={readOnly ? -1 : 0}
				aria-disabled={readOnly}
				class="mb-2 flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 {item.status !==
				'held'
					? 'opacity-80'
					: ''} {dragItem?.id === item.id ? 'opacity-40' : ''} {pickedId === item.id
					? 'border-violet-600 bg-violet-50'
					: 'border-slate-300 bg-white'} {readOnly ? '' : 'cursor-grab active:cursor-grabbing'}"
				onpointerdown={(e) => onPointerDown(e, item)}
				onpointermove={onPointerMove}
				onpointerup={onPointerUp}
				onpointercancel={onPointerUp}
			>
				<div class="min-w-0 flex-1">
					<p class="truncate text-base font-semibold">{item.title}</p>
					<p class="text-sm text-slate-500">
						<span class="font-bold text-slate-700">{formatMoney(item.price_cents * item.quantity)}</span>
						· <span class={statusClass(item)}>{statusLabel(item) || 'не отправлено'}</span>
					</p>
				</div>
				{#if isEditable(item)}
					<button
						type="button"
						class="h-12 w-12 rounded-md border border-slate-300 bg-slate-200 text-xl font-bold"
						onclick={() => onDec(item.id)}>−</button
					>
					<span class="w-7 text-center text-base font-bold">{item.quantity}</span>
					<button
						type="button"
						class="h-12 w-12 rounded-md border border-emerald-800 bg-emerald-600 text-xl font-bold text-white"
						onclick={() => onInc(item.id)}>+</button
					>
				{:else}
					<span class="px-2 text-base font-bold">×{item.quantity}</span>
				{/if}
			</div>
		{:else}
			<p class="mb-2 text-xs text-slate-500">Пусто</p>
		{/each}
	{:else}
		<p class="py-8 text-center text-slate-500">Нет гостей</p>
	{/each}
</div>
