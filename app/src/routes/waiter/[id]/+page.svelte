<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import PinPad from '$lib/components/PinPad.svelte';
	import CartDrawer from '$lib/components/waiter/CartDrawer.svelte';
	import type { DrawerItem } from '$lib/components/waiter/CartDrawer.svelte';
	import { currencySymbol, formatMoney, parseMoney } from '$lib/money';

	type Guest = {
		id: number;
		name: string;
		sort_order: number;
		is_paid: number;
		payment_method: string | null;
		amount_cents: number;
	};
	type Item = DrawerItem & { menu_item_id: number | null };
	type Precheck = {
		id: number;
		status: string;
		total_amount_cents: number;
		hall_name: string;
		hall_color: string;
		guests: Guest[];
		items: Item[];
	};
	type Category = { id: number; name: string };
	type MenuItem = {
		id: number;
		category_id: number;
		title: string;
		price_cents: number;
		is_available: number;
	};
	type Hall = { id: number; name: string; color_hex: string; sort_order: number };

	const isDraft = $derived(page.params.id === 'new');
	const orderId = $derived(isDraft ? null : Number(page.params.id));
	const peek = 80;

	let guests = $state<Guest[]>([]);
	let items = $state<Item[]>([]);
	let hallId = $state<number | null>(null);
	let hallName = $state('');
	let hallColor = $state('#065F46');
	let orderStatus = $state('open');

	let categories = $state<Category[]>([]);
	let menu = $state<MenuItem[]>([]);
	let guestId = $state<number | null>(null);
	let categoryId = $state<number | 'all'>('all');
	let drawerH = $state(64);
	let maxDrawer = $state(400);
	let expandedTile = $state<number | null>(null);
	let error = $state<string | null>(null);
	let customOpen = $state(false);
	let customTitle = $state('');
	let customQty = $state(1);
	let customPrice = $state('');
	let moveItem = $state<Item | null>(null);
	let moveToGuestId = $state<number | null>(null);
	let moveQty = $state('1');
	let payOpen = $state(false);
	let payGuestId = $state<number | null>(null);
	let payMethod = $state<'cash' | 'cashless'>('cashless');
	let cashIn = $state('');

	let swipeStart = $state<{ x: number; y: number } | null>(null);
	let suppressChipClick = false;

	let guestSeq = 0;
	let itemSeq = 0;

	function nextGuestId(): number {
		return --guestSeq;
	}
	function nextItemId(): number {
		return --itemSeq;
	}

	function selectGuest(guest: Guest) {
		if (suppressChipClick) {
			suppressChipClick = false;
			return;
		}
		guestId = guest.id;
	}

	function cycleGuest(dir: 1 | -1) {
		if (guests.length < 2) return;
		const idx = guests.findIndex((g) => g.id === guestId);
		const next = (idx + dir + guests.length) % guests.length;
		guestId = guests[next].id;
	}

	function chipPointerDown(e: PointerEvent) {
		swipeStart = { x: e.clientX, y: e.clientY };
		suppressChipClick = false;
	}

	function chipPointerMove(e: PointerEvent) {
		if (!swipeStart) return;
		if (Math.hypot(e.clientX - swipeStart.x, e.clientY - swipeStart.y) > 12) {
			suppressChipClick = true;
		}
	}

	function chipPointerUp(e: PointerEvent) {
		if (!swipeStart) return;
		const dx = e.clientX - swipeStart.x;
		const dy = e.clientY - swipeStart.y;
		if (suppressChipClick && Math.abs(dx) >= 48 && Math.abs(dy) < 48) {
			cycleGuest(dx < 0 ? 1 : -1);
		}
		swipeStart = null;
	}

	const itemCount = $derived(items.reduce((n, i) => n + i.quantity, 0));
	const totalCents = $derived(
		items.reduce((n, i) => n + i.quantity * i.price_cents, 0)
	);
	const heldCount = $derived(items.filter((i) => i.status === 'held').length);

	const visibleMenu = $derived.by(() => {
		return menu.filter((item) => {
			if (categoryId !== 'all' && item.category_id !== categoryId) return false;
			return true;
		});
	});

	const CATEGORY_COLORS = [
		'bg-emerald-600',
		'bg-sky-600',
		'bg-violet-600',
		'bg-amber-600',
		'bg-rose-600',
		'bg-cyan-600',
		'bg-orange-600',
		'bg-fuchsia-600',
		'bg-indigo-600',
		'bg-teal-600'
	] as const;

	const categoryColors = $derived.by(() => {
		const map = new Map<number, string>();
		categories.forEach((cat, i) => {
			map.set(cat.id, CATEGORY_COLORS[i % CATEGORY_COLORS.length]);
		});
		return map;
	});

	function categoryColor(cat: Category): string {
		return categoryColors.get(cat.id) ?? 'bg-slate-600';
	}

	function tileColor(item: MenuItem): string {
		return categoryColors.get(item.category_id) ?? 'bg-slate-600';
	}

	function qtyOnGuest(menuItemId: number): number {
		if (!guestId) return 0;
		return items
			.filter((i) => i.guest_id === guestId && i.menu_item_id === menuItemId)
			.reduce((n, i) => n + i.quantity, 0);
	}

	onMount(() => {
		function resize() {
			maxDrawer = Math.max(200, window.innerHeight - 76);
		}
		resize();
		window.addEventListener('resize', resize);
		void boot();
		const es = new EventSource('/api/events');
		es.addEventListener('PRECHECK_CANCELLED', (ev) => {
			try {
				const data = JSON.parse(ev.data) as { orderId?: number };
				if (data.orderId === orderId) void goto('/waiter');
			} catch {
				/* ignore */
			}
		});
		es.addEventListener('DEVICE_BLOCKED', () => void goto('/'));
		return () => {
			window.removeEventListener('resize', resize);
			es.close();
		};
	});

	async function boot() {
		if (isDraft) {
			await bootDraft();
			return;
		}
		const [orderRes, menuRes] = await Promise.all([
			fetch(`/api/orders/${orderId}`),
			fetch('/api/menu')
		]);
		if (orderRes.status === 404) {
			await goto('/waiter');
			return;
		}
		if (!orderRes.ok) {
			error = 'Не удалось открыть пречек';
			return;
		}
		const data = await orderRes.json();
		applyPrecheck(data.precheck);
		if ((data.precheck?.items ?? []).length > 0) {
			drawerH = maxDrawer;
		} else {
			drawerH = peek;
		}
		if (menuRes.ok) {
			const m = await menuRes.json();
			categories = m.categories ?? [];
			menu = m.items ?? [];
		}
	}

	async function bootDraft() {
		const hallParam = Number(page.url.searchParams.get('hallId'));
		const [menuRes, hallsRes] = await Promise.all([fetch('/api/menu'), fetch('/api/halls')]);
		if (menuRes.ok) {
			const m = await menuRes.json();
			categories = m.categories ?? [];
			menu = m.items ?? [];
		}
		if (hallsRes.ok) {
			const hd = await hallsRes.json();
			const halls = (hd.halls ?? []) as Hall[];
			const selected = halls.find((h) => h.id === hallParam) ?? halls[0];
			if (selected) {
				hallId = selected.id;
				hallName = selected.name;
				hallColor = selected.color_hex;
			}
		}
		const firstGuest: Guest = {
			id: nextGuestId(),
			name: 'Гость 1',
			sort_order: 0,
			is_paid: 0,
			payment_method: null,
			amount_cents: 0
		};
		guests = [firstGuest];
		guestId = firstGuest.id;
		items = [];
		orderStatus = 'open';
		drawerH = peek;
	}

	function applyPrecheck(next: Precheck) {
		guests = next.guests ?? [];
		items = next.items ?? [];
		hallName = next.hall_name;
		hallColor = next.hall_color;
		orderStatus = next.status;
		if (!guestId || !next.guests.some((g) => g.id === guestId)) {
			guestId = next.guests[0]?.id ?? null;
		}
		if (next.status !== 'open') {
			void goto('/waiter');
		}
	}

	async function applyRes(res: Response) {
		const data = await res.json();
		if (!res.ok) {
			error = data.error === 'stop_list' ? 'Позиция в стоп-листе' : 'Ошибка заказа';
			return;
		}
		if (data.precheck) applyPrecheck(data.precheck);
	}

	async function addMenuItem(item: MenuItem) {
		if (!item.is_available || !guestId) return;
		error = null;
		if (isDraft) {
			const existing = items.find(
				(i) => i.guest_id === guestId && i.menu_item_id === item.id && i.status === 'held'
			);
			if (existing) existing.quantity += 1;
			else {
				items = [
					...items,
					{
						id: nextItemId(),
						guest_id: guestId,
						menu_item_id: item.id,
						title: item.title,
						price_cents: item.price_cents,
						quantity: 1,
						status: 'held',
						is_custom: 0
					}
				];
			}
			return;
		}
		const res = await fetch(`/api/orders/${orderId}/items`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ guestId, menuItemId: item.id })
		});
		await applyRes(res);
	}

	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	function tilePointerDown(item: MenuItem, e: PointerEvent) {
		if (!item.is_available) return;
		const startX = e.clientX;
		const startY = e.clientY;
		pressTimer = setTimeout(() => {
			expandedTile = item.id;
			pressTimer = undefined;
		}, 300);
		function move(ev: PointerEvent) {
			if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 12 && pressTimer) {
				clearTimeout(pressTimer);
				pressTimer = undefined;
			}
		}
		function up() {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			if (pressTimer) {
				clearTimeout(pressTimer);
				pressTimer = undefined;
				if (expandedTile !== item.id) void addMenuItem(item);
			}
		}
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	async function changeQty(itemId: number, action: 'inc' | 'dec') {
		if (isDraft) {
			const target = items.find((i) => i.id === itemId);
			if (!target) return;
			if (action === 'inc') target.quantity += 1;
			else if (target.quantity <= 1) items = items.filter((i) => i.id !== itemId);
			else target.quantity -= 1;
			return;
		}
		await applyRes(
			await fetch(`/api/orders/${orderId}/items/${itemId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			})
		);
	}

	async function removeItem(itemId: number) {
		if (isDraft) {
			items = items.filter((i) => i.id !== itemId);
			return;
		}
		await applyRes(await fetch(`/api/orders/${orderId}/items/${itemId}`, { method: 'DELETE' }));
	}

	async function addGuest() {
		if (isDraft) {
			const g: Guest = {
				id: nextGuestId(),
				name: `Гость ${guests.length + 1}`,
				sort_order: guests.length,
				is_paid: 0,
				payment_method: null,
				amount_cents: 0
			};
			guests = [...guests, g];
			guestId = g.id;
			drawerH = maxDrawer;
			return;
		}
		const res = await fetch(`/api/orders/${orderId}/guests`, { method: 'POST' });
		const data = await res.json();
		if (res.ok && data.precheck) {
			applyPrecheck(data.precheck);
			guestId = data.guestId;
			drawerH = maxDrawer;
		}
	}

	async function renameGuest(id: number, name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;
		if (isDraft) {
			const g = guests.find((x) => x.id === id);
			if (g) g.name = trimmed;
			return;
		}
		await applyRes(
			await fetch(`/api/orders/${orderId}/guests/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: trimmed })
			})
		);
	}

	async function addCustom() {
		if (!guestId) return;
		const price = parseMoney(customPrice);
		if (!customTitle.trim() || !Number.isFinite(price) || price < 0) return;
		const title = customTitle.trim();
		if (isDraft) {
			items = [
				...items,
				{
					id: nextItemId(),
					guest_id: guestId,
					menu_item_id: null,
					title,
					price_cents: price,
					quantity: customQty,
					status: 'held',
					is_custom: 1
				}
			];
			customOpen = false;
			customTitle = '';
			customQty = 1;
			customPrice = '';
			return;
		}
		await applyRes(
			await fetch(`/api/orders/${orderId}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ guestId, title, priceCents: price, quantity: customQty })
			})
		);
		customOpen = false;
		customTitle = '';
		customQty = 1;
		customPrice = '';
	}

	async function moveItemTo(itemId: number, toGuestId: number, quantity: number) {
		if (isDraft) {
			const src = items.find((i) => i.id === itemId);
			if (!src || src.guest_id === toGuestId) return;
			if (quantity >= src.quantity) {
				src.guest_id = toGuestId;
			} else {
				src.quantity -= quantity;
				const existing =
					src.is_custom === 0 && src.menu_item_id != null
						? items.find(
								(i) =>
									i.guest_id === toGuestId &&
									i.menu_item_id === src.menu_item_id &&
									i.status === 'held'
							)
						: undefined;
				if (existing) existing.quantity += quantity;
				else {
					items = [
						...items,
						{
							id: nextItemId(),
							guest_id: toGuestId,
							menu_item_id: src.menu_item_id,
							title: src.title,
							price_cents: src.price_cents,
							quantity,
							status: 'held',
							is_custom: src.is_custom
						}
					];
				}
			}
			return;
		}
		await applyRes(
			await fetch(`/api/orders/${orderId}/items/${itemId}/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toGuestId, quantity })
			})
		);
	}

	function requestMove(item: DrawerItem, toGuestId: number) {
		const src = items.find((i) => i.id === item.id);
		if (!src || src.guest_id === toGuestId) return;
		if (src.quantity === 1) {
			void moveItemTo(src.id, toGuestId, 1);
			return;
		}
		moveItem = src;
		moveToGuestId = toGuestId;
		moveQty = '1';
	}

	async function confirmMove() {
		if (!moveItem || !moveToGuestId) return;
		const quantity = Math.max(1, Math.min(moveItem.quantity, Number(moveQty) || 1));
		await moveItemTo(moveItem.id, moveToGuestId, quantity);
		moveItem = null;
		moveToGuestId = null;
	}

	async function fire() {
		if (isDraft) {
			await commitDraft({ fired: true });
			return;
		}
		await applyRes(await fetch(`/api/orders/${orderId}/fire`, { method: 'POST' }));
	}

	async function pay() {
		if (!payGuestId) return;
		if (isDraft) {
			await commitDraft({
				fired: false,
				pay: {
					guestIndex: guests.findIndex((g) => g.id === payGuestId),
					method: payMethod,
					cashReceivedCents: payMethod === 'cash' ? parseMoney(cashIn) : undefined
				}
			});
			payOpen = false;
			cashIn = '';
			return;
		}
		const cashReceivedCents = payMethod === 'cash' ? parseMoney(cashIn) : undefined;
		const res = await fetch(`/api/orders/${orderId}/pay`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ guestId: payGuestId, method: payMethod, cashReceivedCents })
		});
		await applyRes(res);
		payOpen = false;
		cashIn = '';
	}

	async function commitDraft(opts: {
		fired: boolean;
		pay?: { guestIndex: number; method: 'cash' | 'cashless'; cashReceivedCents?: number };
	}) {
		error = null;
		const payload = {
			hallId: hallId ?? undefined,
			guests: guests.map((g) => g.name),
			items: items.map((i) => ({
				guestIndex: guests.findIndex((g) => g.id === i.guest_id),
				menuItemId: i.menu_item_id ?? undefined,
				title: i.menu_item_id == null ? i.title : undefined,
				priceCents: i.menu_item_id == null ? i.price_cents : undefined,
				quantity: i.quantity
			})),
			fired: opts.fired,
			pay: opts.pay
		};
		const res = await fetch('/api/orders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await res.json();
		if (!res.ok) {
			error = data.error === 'cash_too_low' ? 'Недостаточно наличных' : (data.message ?? data.error ?? 'Не удалось сохранить пречек');
			return;
		}
		await goto(`/waiter/${data.id}`, { replaceState: true });
	}

	function openPay() {
		const unpaid = guests.filter((g) => !g.is_paid);
		payGuestId = unpaid[0]?.id ?? null;
		payMethod = 'cashless';
		cashIn = '';
		payOpen = true;
	}

	function guestTotal(id: number): number {
		return items.filter((i) => i.guest_id === id).reduce((n, i) => n + i.quantity * i.price_cents, 0);
	}

	function printCheck() {
		window.print();
	}
</script>

<svelte:head>
	<title>{isDraft ? 'Новый пречек' : `Пречек №${orderId}`}</title>
</svelte:head>

<div class="flex h-dvh flex-col bg-slate-100">
	<header class="shrink-0 px-3 py-2 text-white" style="background-color: {hallColor}">
		<div class="flex items-center gap-3">
			<a href="/waiter" aria-label="Назад" class="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-black/20 text-xl font-bold">←</a>
			<span class="min-w-0 flex-1 truncate text-base font-semibold">{hallName}</span>
		</div>
	</header>

	<div class="relative min-h-0 flex-1">
		<CartDrawer
			bind:height={drawerH}
			{peek}
			maxHeight={maxDrawer}
			{itemCount}
			{totalCents}
			guests={guests.map((g) => ({ id: g.id, name: g.name }))}
			{items}
			onInc={(id) => changeQty(id, 'inc')}
			onDec={(id) => changeQty(id, 'dec')}
			onDelete={removeItem}
			onMove={requestMove}
			onRename={renameGuest}
		>
			{#snippet footer()}
				<div class="grid grid-cols-4 gap-2 p-2 print:hidden">
					<button type="button" onclick={addGuest} class="h-14 rounded bg-violet-600 text-base font-bold text-white">
						+ Гость
					</button>
					<button type="button" onclick={printCheck} class="h-14 rounded bg-slate-600 text-base font-bold text-white">
						Печать
					</button>
					<button
						type="button"
						onclick={fire}
						disabled={heldCount === 0}
						class="h-14 rounded bg-sky-600 text-base font-bold text-white disabled:opacity-40"
					>
						На кухню
					</button>
					<button type="button" onclick={openPay} class="h-14 rounded bg-emerald-600 text-lg font-bold text-white">
						Оплата
					</button>
				</div>
			{/snippet}
		</CartDrawer>

		<div class="flex h-full flex-col pt-20 pb-2">
			<div class="px-3 pt-2">
				<div class="flex gap-2 overflow-x-auto pb-1">
					<button
						type="button"
						onclick={() => (categoryId = 'all')}
						class="h-12 shrink-0 rounded px-4 text-base font-bold {categoryId === 'all'
							? 'bg-slate-800 text-white'
							: 'bg-slate-200 text-slate-700'}"
					>
						Все
					</button>
					{#each categories as cat}
						<button
							type="button"
							onclick={() => (categoryId = cat.id)}
							class="h-12 shrink-0 rounded px-4 text-base font-bold {categoryId === cat.id
								? categoryColor(cat) + ' text-white'
								: 'bg-slate-200 text-slate-700'}"
						>
							{cat.name}
						</button>
					{/each}
				</div>
			</div>

			{#if error}
				<p class="px-3 text-sm text-rose-600">{error}</p>
			{/if}

			<div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
				<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
					<button
						type="button"
						onclick={() => (customOpen = true)}
						class="min-h-28 rounded-md border-2 border-dashed border-slate-400 bg-slate-700 p-3 text-left text-white"
					>
						<p class="text-lg font-bold">Произвольный товар</p>
						<p class="text-sm font-semibold text-slate-300">Ввести вручную</p>
					</button>
					{#each visibleMenu as item}
						<div
							role="button"
							tabindex="0"
							class="relative min-h-28 rounded-md p-3 text-white {item.is_available
								? tileColor(item)
								: 'bg-slate-300 text-slate-500'}"
							onpointerdown={(e) => tilePointerDown(item, e)}
						>
							{#if qtyOnGuest(item.id) > 0}
								<button
									type="button"
									onpointerdown={(e) => e.stopPropagation()}
									onclick={(e) => {
										e.stopPropagation();
										expandedTile = item.id;
									}}
									class="absolute right-2 top-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-white px-1 text-sm font-extrabold text-rose-600 shadow"
								>
									{qtyOnGuest(item.id)}
								</button>
							{/if}
							<p class="pr-10 text-lg font-bold leading-tight drop-shadow-sm">{item.title}</p>
							<p class="mt-1 text-xl font-extrabold drop-shadow-sm">{formatMoney(item.price_cents)}</p>
							{#if !item.is_available}
								<p class="mt-1 text-xs font-bold text-rose-700">Стоп-лист</p>
							{/if}
							{#if expandedTile === item.id && item.is_available}
								<div class="mt-2 flex items-center gap-2">
									<button
										type="button"
										class="h-12 w-12 rounded bg-black/25 text-2xl font-bold text-white"
										onpointerdown={(e) => e.stopPropagation()}
										onclick={(e) => {
											e.stopPropagation();
											const line = items.find(
												(i) =>
													i.guest_id === guestId &&
													i.menu_item_id === item.id &&
													i.status === 'held'
											);
											if (line) void changeQty(line.id, 'dec');
										}}>−</button
									>
									<button
										type="button"
										class="h-12 w-12 rounded bg-white text-2xl font-bold text-slate-900"
										onpointerdown={(e) => e.stopPropagation()}
										onclick={(e) => {
											e.stopPropagation();
											void addMenuItem(item);
										}}>+</button
									>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

{#if customOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="w-full max-w-sm rounded-md bg-slate-100 p-4">
			<p class="font-semibold">Произвольный товар</p>
			<input bind:value={customTitle} placeholder="Название" class="mt-3 h-12 w-full rounded-md bg-white px-3" />
			<div class="mt-3 flex items-center gap-2">
				<button type="button" class="h-12 w-12 rounded-md bg-white" onclick={() => (customQty = Math.max(1, customQty - 1))}
					>−</button
				>
				<span class="w-8 text-center">{customQty}</span>
				<button type="button" class="h-12 w-12 rounded-md bg-white" onclick={() => (customQty += 1)}>+</button>
			</div>
			<p class="mt-3 text-sm text-slate-500">Цена, {currencySymbol()}</p>
			<p class="mb-2 font-mono text-2xl">{customPrice || '0'} {currencySymbol()}</p>
			<PinPad bind:value={customPrice} maxLength={10} />
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button type="button" class="h-12 rounded-md bg-white" onclick={() => (customOpen = false)}>Закрыть</button>
				<button type="button" class="h-12 rounded-md bg-emerald-600 text-white font-semibold" onclick={addCustom}>Добавить</button>
			</div>
		</div>
	</div>
{/if}

{#if moveItem}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="w-full max-w-sm rounded-md bg-slate-100 p-4">
			<p class="font-semibold">Перенос: {moveItem.title}</p>
			<label class="mt-3 block text-sm text-slate-500">
				Сколько перенести (1…{moveItem.quantity})
				<input bind:value={moveQty} type="number" min="1" max={moveItem.quantity} class="mt-1 h-12 w-full rounded-md bg-white px-3" />
			</label>
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button
					type="button"
					class="h-12 rounded-md bg-white"
					onclick={() => {
						moveItem = null;
						moveToGuestId = null;
					}}>Отмена</button
				>
				<button type="button" class="h-12 rounded-md bg-emerald-600 font-semibold text-white" onclick={confirmMove}
					>Перенести</button
				>
			</div>
		</div>
	</div>
{/if}

{#if payOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="w-full max-w-sm rounded-md bg-slate-100 p-4">
			<p class="text-lg font-bold">Оплата</p>
			{#if guests.filter((g) => !g.is_paid).length > 1}
				<p class="mt-2 text-sm text-slate-500">Кого считаем?</p>
				<div class="mt-2 space-y-2">
					{#each guests.filter((g) => !g.is_paid) as guest}
						<button
							type="button"
							onclick={() => (payGuestId = guest.id)}
							class="h-14 w-full rounded text-base font-semibold {payGuestId === guest.id
								? 'bg-emerald-600 text-white'
								: 'bg-white'}"
						>
							{guest.name} — {formatMoney(guestTotal(guest.id))}
						</button>
					{/each}
				</div>
			{:else if payGuestId}
				<p class="mt-2 text-3xl font-bold text-emerald-700">{formatMoney(guestTotal(payGuestId))}</p>
			{/if}
			<div class="mt-3 grid grid-cols-2 gap-2">
				<button
					type="button"
					class="h-14 rounded text-base font-bold {payMethod === 'cashless'
						? 'bg-emerald-600 text-white'
						: 'bg-slate-200 text-slate-700'}"
					onclick={() => (payMethod = 'cashless')}>Безнал</button
				>
				<button
					type="button"
					class="h-14 rounded text-base font-bold {payMethod === 'cash'
						? 'bg-emerald-600 text-white'
						: 'bg-slate-200 text-slate-700'}"
					onclick={() => (payMethod = 'cash')}>Наличные</button
				>
			</div>
			{#if payMethod === 'cash'}
				<p class="mt-3 text-sm text-slate-500">Внесено, {currencySymbol()}</p>
				<p class="font-mono text-2xl">{cashIn || '0'}</p>
				<PinPad bind:value={cashIn} maxLength={10} />
				{#if payGuestId && parseMoney(cashIn) >= guestTotal(payGuestId)}
					<p class="mt-2 text-emerald-600">
						Сдача: {formatMoney(parseMoney(cashIn) - guestTotal(payGuestId))}
					</p>
				{/if}
			{/if}
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button
					type="button"
					class="h-14 rounded bg-slate-200 text-base font-bold text-slate-800"
					onclick={() => (payOpen = false)}>Закрыть</button
				>
				<button
					type="button"
					class="h-14 rounded bg-emerald-600 text-base font-bold text-white"
					onclick={pay}>Оплачено</button
				>
			</div>
		</div>
	</div>
{/if}

<div class="hidden print:block p-6 text-black">
	<h1>{isDraft ? 'Новый пречек' : `Пречек №${orderId}`}</h1>
	<p>{hallName}</p>
	{#each guests as guest}
		<h2>{guest.name}</h2>
		<ul>
			{#each items.filter((i) => i.guest_id === guest.id) as item}
				<li>{item.quantity}× {item.title} — {formatMoney(item.price_cents * item.quantity)}</li>
			{/each}
		</ul>
	{/each}
	<p>Итого: {formatMoney(totalCents)}</p>
</div>
