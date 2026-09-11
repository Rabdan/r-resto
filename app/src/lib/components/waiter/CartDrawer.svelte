<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatMoney } from '$lib/money';

	export type DrawerItem = {
		id: number;
		guest_id: number;
		title: string;
		price_cents: number;
		quantity: number;
		status: string;
		is_custom: number;
	};
	export type DrawerGuest = { id: number; name: string };

	let {
		height = $bindable(),
		peek = 64,
		maxHeight,
		itemCount,
		totalCents,
		guests,
		items,
		onInc,
		onDec,
		onDelete,
		onMove,
		onRename,
		footer
	}: {
		height: number;
		peek?: number;
		maxHeight: number;
		itemCount: number;
		totalCents: number;
		guests: DrawerGuest[];
		items: DrawerItem[];
		onInc: (id: number) => void;
		onDec: (id: number) => void;
		onDelete: (id: number) => void;
		onMove: (item: DrawerItem, toGuestId: number) => void;
		onRename: (id: number, name: string) => void;
		footer?: Snippet;
	} = $props();

	const half = $derived(Math.round(maxHeight * 0.55));
	const expanded = $derived(height > peek + 8);

	let dragging = $state(false);
	let startY = 0;
	let startH = 0;

	let editingId = $state<number | null>(null);
	let nameDraft = $state('');
	let nameInput = $state<HTMLInputElement | null>(null);

	let dragItem = $state<DrawerItem | null>(null);
	let dragOverGuestId = $state<number | null>(null);

	$effect(() => {
		if (editingId != null) {
			nameInput?.focus();
			nameInput?.select();
		}
	});

	function snapExpanded(value: number) {
		const points = [half, maxHeight];
		let best = maxHeight;
		let bestDist = Infinity;
		for (const p of points) {
			const d = Math.abs(value - p);
			if (d < bestDist) {
				bestDist = d;
				best = p;
			}
		}
		height = best;
	}

	function collapseToMenu() {
		height = peek;
	}

	function expandDrawer() {
		height = maxHeight;
	}

	function onPointerDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
		startY = e.clientY;
		startH = height;
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const minH = startH <= peek + 8 ? peek : half;
		const next = Math.min(maxHeight, Math.max(minH, startH + (e.clientY - startY)));
		height = next;
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		const moved = Math.abs(height - startH);
		const wasPeek = startH <= peek + 8;
		if (moved < 12) {
			if (wasPeek) height = maxHeight;
			return;
		}
		if (wasPeek) {
			snapExpanded(Math.max(height, half));
			return;
		}
		snapExpanded(height);
	}

	function statusLabel(status: string): string {
		if (status === 'ready') return 'Готово';
		if (status === 'pending') return 'Кухня';
		if (status === 'out_of_stock') return 'Нет блюда';
		return '';
	}

	function guestTotal(id: number): number {
		return items
			.filter((i) => i.guest_id === id)
			.reduce((n, i) => n + i.quantity * i.price_cents, 0);
	}

	function startEdit(guest: DrawerGuest) {
		editingId = guest.id;
		nameDraft = guest.name;
	}

	function commitEdit(id: number) {
		editingId = null;
		onRename(id, nameDraft);
	}

	function startDrag(e: PointerEvent, item: DrawerItem) {
		if ((e.target as HTMLElement).closest('button')) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragItem = item;
		dragOverGuestId = null;
	}

	function dropTargetUnder(e: PointerEvent): number | null {
		const el = document.elementFromPoint(e.clientX, e.clientY);
		const host = el?.closest('[data-guest-drop]') as HTMLElement | null;
		if (!host) return null;
		const id = Number(host.getAttribute('data-guest-id'));
		return Number.isFinite(id) ? id : null;
	}

	function onDragMove(e: PointerEvent) {
		if (!dragItem) return;
		dragOverGuestId = dropTargetUnder(e);
	}

	function onDragEnd(e: PointerEvent) {
		if (!dragItem) return;
		const item = dragItem;
		const target = dropTargetUnder(e);
		dragItem = null;
		dragOverGuestId = null;
		if (target != null && target !== item.guest_id) {
			onMove(item, target);
		}
	}
</script>

<div class="pointer-events-none absolute inset-0 z-30">
	<div
		class="pointer-events-auto flex flex-col overflow-hidden rounded-b-2xl border-b border-slate-200 bg-amber-50 shadow-xl"
		style="height: {height}px; transition: {dragging ? 'none' : 'height 0.22s ease-out'}"
	>
		<div
			role="button"
			tabindex="0"
			class="flex shrink-0 cursor-grab touch-none items-center justify-between gap-2 border-t border-slate-200 bg-amber-50 px-3 active:cursor-grabbing"
			style="height: {peek}px; touch-action: none"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<div class="min-w-0 flex-1">
				<p class="text-xl font-bold uppercase tracking-wide text-emerald-600">Заказ</p>
				<p class="truncate text-xl font-bold">
					{itemCount} поз. — <span class="text-rose-600 text-2xl">{formatMoney(totalCents)}</span>
				</p>
			</div>
			<button
				type="button"
				class="flex h-12 shrink-0 items-center gap-1.5 rounded-md px-3 font-bold text-white shadow-sm {expanded
					? 'bg-slate-700'
					: 'bg-emerald-600'}"
				aria-label={expanded ? 'Свернуть заказ' : 'Раскрыть заказ'}
				onpointerdown={(e) => e.stopPropagation()}
				onclick={(e) => {
					e.stopPropagation();
					if (expanded) collapseToMenu();
					else expandDrawer();
				}}
			>
				<span class="text-sm">{expanded ? 'Свернуть' : 'Позиции'}</span>
				{#if expanded}
					<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M18 15l-6-6-6 6" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M6 9l6 6 6-6" />
					</svg>
				{/if}
			</button>
		</div>

		{#if expanded}
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div class="flex-1 overflow-y-auto px-3 pb-3 pt-2">
					{#each guests as guest}
						<div
							data-guest-drop
							data-guest-id={guest.id}
							class="sticky top-0 flex items-center justify-between gap-2 border-t-2 bg-amber-50 py-1 pb-2 pt-2 {dragOverGuestId ===
							guest.id
								? 'ring-2 ring-emerald-500'
								: ''}"
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
							{:else}
								<button
									type="button"
									class="min-w-0 flex-1 text-left text-lg font-bold text-emerald-700"
									onclick={() => startEdit(guest)}
								>
									Гость: {guest.name}
								</button>
							{/if}
							<span class="shrink-0 text-base font-bold text-rose-600">{formatMoney(guestTotal(guest.id))}</span>
						</div>
						{#each items.filter((i) => i.guest_id === guest.id) as item}
							<div
								role="button"
								tabindex="0"
								class="mb-2 flex min-h-14 touch-none cursor-grab items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 active:cursor-grabbing {item.status !==
								'held'
									? 'opacity-80'
									: ''} {dragItem?.id === item.id ? 'opacity-40' : ''}"
								onpointerdown={(e) => startDrag(e, item)}
								onpointermove={onDragMove}
								onpointerup={onDragEnd}
								onpointercancel={onDragEnd}
							>
								<div class="min-w-0 flex-1">
									<p class="truncate text-base font-semibold">{item.title}</p>
									<p class="text-sm text-slate-500">
										<span class="font-bold text-slate-700">{formatMoney(item.price_cents)}</span>
										· {statusLabel(item.status) || 'не отправлено'}
									</p>
								</div>
								{#if item.status === 'held'}
									<button
										type="button"
										class="h-12 w-12 rounded bg-slate-200 text-xl font-bold"
										onclick={() => onDec(item.id)}>−</button
									>
									<span class="w-7 text-center text-base font-bold">{item.quantity}</span>
									<button
										type="button"
										class="h-12 w-12 rounded bg-emerald-600 text-xl font-bold text-white"
										onclick={() => onInc(item.id)}>+</button
									>
									<button
										type="button"
										class="h-12 w-12 rounded bg-rose-100 text-lg font-bold text-rose-700"
										onclick={() => onDelete(item.id)}>✕</button
									>
								{:else}
									<span class="px-2 text-base font-bold">×{item.quantity}</span>
								{/if}
							</div>
						{:else}
							<p class="mb-2 text-xs text-slate-500">Пусто</p>
						{/each}
					{/each}
				</div>
				{#if footer}
					<div class="shrink-0 border-t-2 border-slate-200 bg-white">
						{@render footer()}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
