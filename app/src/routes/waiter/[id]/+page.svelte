<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { onPosEvent, posSession } from '$lib/client/pos-session.svelte';
	import PinPad from '$lib/components/PinPad.svelte';
	import MenuSheet from '$lib/components/waiter/MenuSheet.svelte';
	import type { MenuSheetItem } from '$lib/components/waiter/MenuSheet.svelte';
	import PayDialog from '$lib/components/waiter/PayDialog.svelte';
	import OrderItems from '$lib/components/waiter/OrderItems.svelte';
	import type { OrderLine } from '$lib/components/waiter/OrderItems.svelte';
	import { posRolesOf } from '$lib/types';
	import { currencySymbol, formatMoney, parseMoney } from '$lib/money';

	type Guest = {
		id: number;
		name: string;
		sort_order: number;
		is_paid: number;
		payment_method: string | null;
		amount_cents: number;
	};
	type Item = OrderLine & { menu_item_id: number | null };
	type OrderDetail = {
		id: number;
		status: string;
		total_amount_cents: number;
		created_at?: string;
		hall_id?: number;
		hall_name: string;
		hall_color: string;
		qr_image_path?: string | null;
		guests: Guest[];
		items: Item[];
	};
	type Category = { id: number; name: string; color_hex: string };
	type MenuItem = MenuSheetItem;
	type Hall = {
		id: number;
		name: string;
		color_hex: string;
		sort_order: number;
		qr_image_path?: string | null;
	};

	const isDraft = $derived(page.params.id === 'new');
	const orderId = $derived(isDraft ? null : Number(page.params.id));
	const showHome = $derived(posRolesOf(posSession.device).length > 1);

	let guests = $state<Guest[]>([]);
	let items = $state<Item[]>([]);
	let hallId = $state<number | null>(null);
	let hallName = $state('');
	let hallColor = $state('#065F46');
	let hallQrPath = $state<string | null>(null);
	let createdAt = $state<string | null>(null);
	let orderStatus = $state('open');
	const isClosed = $derived(orderStatus === 'closed');

	let categories = $state<Category[]>([]);
	let menu = $state<MenuItem[]>([]);
	let guestId = $state<number | null>(null);
	let menuOpen = $state(page.params.id === 'new');
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
	let payError = $state<string | null>(null);
	let splitMode = $state(false);
	let shiftOpen = $state(true);

	let guestSeq = 0;
	let itemSeq = 0;

	function nextGuestId(): number {
		return --guestSeq;
	}
	function nextItemId(): number {
		return --itemSeq;
	}

	const itemCount = $derived(items.reduce((n, i) => n + i.quantity, 0));
	const totalCents = $derived(items.reduce((n, i) => n + i.quantity * i.price_cents, 0));
	const heldCount = $derived(items.filter((i) => i.status === 'held').length);

	function qtyInCheck(menuItemId: number): number {
		return items
			.filter((i) => i.menu_item_id === menuItemId)
			.reduce((n, i) => n + i.quantity, 0);
	}

	onMount(() => {
		void boot();
		const offCancelled = onPosEvent('ORDER_CANCELLED', (ev) => {
			try {
				const data = JSON.parse(ev.data) as { orderId?: number };
				if (data.orderId === orderId) void goto('/waiter');
			} catch {
				/* ignore */
			}
		});
		const offMenu = onPosEvent('MENU_UPDATED', () => {
			if (!isClosed) void loadMenu();
		});
		const offItem = onPosEvent('ITEM_STATUS_CHANGED', (ev) => {
			try {
				const data = JSON.parse(ev.data) as { orderId?: number };
				if (!isDraft && data.orderId === orderId) void reloadOrder();
			} catch {
				/* ignore */
			}
		});
		const offShiftClosed = onPosEvent('SHIFT_CLOSED', () => {
			shiftOpen = false;
		});
		const offShiftOpened = onPosEvent('SHIFT_OPENED', () => {
			shiftOpen = true;
		});
		const offUpdated = onPosEvent('ORDER_UPDATED', (ev) => {
			try {
				const data = JSON.parse(ev.data) as { orderId?: number };
				if (!isDraft && data.orderId === orderId) void reloadOrder();
			} catch {
				/* ignore */
			}
		});
		return () => {
			offCancelled();
			offMenu();
			offItem();
			offShiftClosed();
			offShiftOpened();
			offUpdated();
		};
	});

	afterNavigate(({ from, to }) => {
		if (!from || !to) return;
		if (from.params?.id === to.params?.id) return;
		void boot();
	});

	async function boot() {
		if (isDraft) {
			menuOpen = true;
			await bootDraft();
			return;
		}
		menuOpen = false;
		const orderRes = await fetch(`/api/orders/${orderId}`);
		if (orderRes.status === 404) {
			await goto('/waiter');
			return;
		}
		if (!orderRes.ok) {
			error = 'Не удалось открыть заказ';
			return;
		}
		const data = await orderRes.json();
		applyOrder(data.order);
		if (data.order?.status === 'open') await loadMenu();
		if (page.url.searchParams.get('pay') === '1' && data.order?.status === 'open') openPay();
		if (page.url.searchParams.get('print') === '1') printCheck();
		if (page.url.searchParams.get('addGuest') === '1' && data.order?.status === 'open') {
			void addGuest();
		}
	}

	async function reloadOrder() {
		if (isDraft || orderId == null) return;
		const res = await fetch(`/api/orders/${orderId}`);
		if (!res.ok) return;
		const data = await res.json();
		if (data.order) applyOrder(data.order);
	}

	async function loadMenu() {
		const menuRes = await fetch('/api/menu');
		if (!menuRes.ok) return;
		const m = await menuRes.json();
		categories = m.categories ?? [];
		menu = m.items ?? [];
	}

	async function bootDraft() {
		const hallParam = Number(page.url.searchParams.get('hallId'));
		const [, hallsRes] = await Promise.all([loadMenu(), fetch('/api/halls')]);
		if (hallsRes.ok) {
			const hd = await hallsRes.json();
			const halls = (hd.halls ?? []) as Hall[];
			const selected = halls.find((h) => h.id === hallParam) ?? halls[0];
			if (selected) {
				hallId = selected.id;
				hallName = selected.name;
				hallColor = selected.color_hex;
				hallQrPath = selected.qr_image_path ?? null;
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
	}

	function applyOrder(next: OrderDetail) {
		guests = next.guests ?? [];
		items = next.items ?? [];
		hallName = next.hall_name;
		hallColor = next.hall_color;
		orderStatus = next.status;
		if (next.hall_id != null) hallId = next.hall_id;
		if (next.qr_image_path !== undefined) hallQrPath = next.qr_image_path ?? null;
		if (next.created_at) createdAt = next.created_at;
		const unpaid = next.guests.filter((g) => !g.is_paid);
		if (!guestId || !unpaid.some((g) => g.id === guestId)) {
			guestId = unpaid[0]?.id ?? next.guests[0]?.id ?? null;
		}
		if (next.status === 'cancelled') {
			void goto('/waiter');
			return;
		}
		if (next.status !== 'open') {
			menuOpen = false;
			payOpen = false;
		}
	}

	function orderErrorMessage(code: string | undefined, fallback = 'Ошибка заказа'): string {
		switch (code) {
			case 'cash_too_low':
				return 'Недостаточно наличных';
			case 'empty_guest':
				return 'У гостя нет позиций';
			case 'shift_closed':
				return 'Смена закрыта';
			case 'guest_paid':
			case 'already_paid':
				return 'Гость уже оплачен';
			case 'stop_list':
				return 'Позиция в стоп-листе';
			case 'last_guest':
				return 'Нельзя удалить последнего гостя';
			case 'guest_has_items':
				return 'Сначала перенеси или удали позиции';
			default:
				return fallback;
		}
	}

	async function applyRes(res: Response) {
		const data = await res.json();
		if (!res.ok) {
			error = orderErrorMessage(data.error, data.message ?? 'Ошибка заказа');
			return false;
		}
		if (data.order) applyOrder(data.order);
		return true;
	}

	function selectGuest(id: number) {
		const guest = guests.find((g) => g.id === id);
		if (!guest || guest.is_paid) return;
		guestId = id;
	}

	async function addMenuItem(item: MenuItem) {
		if (!item.is_available || !guestId) return;
		const current = guests.find((g) => g.id === guestId);
		if (current?.is_paid) {
			error = 'Гость уже оплачен';
			return;
		}
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

	async function changeQty(itemId: number, action: 'inc' | 'dec') {
		if (isClosed) return;
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
		if (isClosed) return;
		if (isDraft) {
			items = items.filter((i) => i.id !== itemId);
			return;
		}
		await applyRes(await fetch(`/api/orders/${orderId}/items/${itemId}`, { method: 'DELETE' }));
	}

	async function addGuest() {
		if (isClosed) return;
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
			return;
		}
		const res = await fetch(`/api/orders/${orderId}/guests`, { method: 'POST' });
		const data = await res.json();
		if (res.ok && data.order) {
			applyOrder(data.order);
			guestId = data.guestId;
		}
	}

	async function removeGuest(id: number) {
		if (isClosed) return;
		if (guests.length <= 1) return;
		if (items.some((i) => i.guest_id === id)) {
			error = 'Сначала перенеси или удали позиции';
			return;
		}
		if (isDraft) {
			guests = guests.filter((g) => g.id !== id);
			if (guestId === id) guestId = guests.find((g) => !g.is_paid)?.id ?? guests[0]?.id ?? null;
			return;
		}
		await applyRes(await fetch(`/api/orders/${orderId}/guests/${id}`, { method: 'DELETE' }));
	}

	async function renameGuest(id: number, name: string) {
		const trimmed = name.trim();
		if (!trimmed || isClosed) return;
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
		if (!guestId || isClosed) return;
		const current = guests.find((g) => g.id === guestId);
		if (current?.is_paid) {
			error = 'Гость уже оплачен';
			return;
		}
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
		if (isClosed) return;
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

	function requestMove(item: OrderLine, toGuestId: number) {
		const src = items.find((i) => i.id === item.id);
		if (!src || src.guest_id === toGuestId || isClosed) return;
		if (src.quantity === 1) {
			void moveItemTo(src.id, toGuestId, 1);
			return;
		}
		if (src.quantity === 2) {
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
		if (isClosed) return;
		if (isDraft) {
			await commitDraft({ fired: true });
			return;
		}
		await applyRes(await fetch(`/api/orders/${orderId}/fire`, { method: 'POST' }));
	}

	async function pay() {
		if (!payGuestId || isClosed) return;
		payError = null;
		if (isDraft) {
			const ok = await commitDraft({
				fired: false,
				pay: {
					guestIndex: guests.findIndex((g) => g.id === payGuestId),
					method: payMethod,
					cashReceivedCents: payMethod === 'cash' ? parseMoney(cashIn) : undefined
				}
			});
			if (ok) {
				payOpen = false;
				cashIn = '';
			} else {
				payError = error;
			}
			return;
		}
		const cashReceivedCents = payMethod === 'cash' ? parseMoney(cashIn) : undefined;
		const res = await fetch(`/api/orders/${orderId}/pay`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ guestId: payGuestId, method: payMethod, cashReceivedCents })
		});
		const ok = await applyRes(res);
		if (ok) {
			payOpen = false;
			cashIn = '';
			payError = null;
		} else {
			payError = error;
		}
	}

	async function commitDraft(opts: {
		fired: boolean;
		pay?: { guestIndex: number; method: 'cash' | 'cashless'; cashReceivedCents?: number };
	}): Promise<boolean> {
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
			error = orderErrorMessage(data.error, data.message ?? 'Не удалось сохранить заказ');
			return false;
		}
		if (data.order) applyOrder(data.order);
		menuOpen = false;
		await goto(`/waiter/${data.id}`, { replaceState: true });
		return true;
	}

	function openPay() {
		if (isClosed) return;
		const unpaid = guests.filter((g) => !g.is_paid && guestTotal(g.id) > 0);
		payGuestId = unpaid[0]?.id ?? null;
		payMethod = 'cashless';
		cashIn = '';
		payError = null;
		payOpen = true;
	}

	function guestTotal(id: number): number {
		return items.filter((i) => i.guest_id === id).reduce((n, i) => n + i.quantity * i.price_cents, 0);
	}

	function printCheck() {
		window.print();
	}

	function printWhen(): string {
		const src = createdAt;
		if (src) {
			const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(src);
			if (m) {
				const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
				return d.toLocaleString('ru-RU', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			}
		}
		return new Date().toLocaleString('ru-RU', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function imageUrl(path: string | null): string {
		return path ? `/api/uploads/${path}` : '';
	}
</script>

<svelte:head>
	<title>{isDraft ? 'Новый заказ' : isClosed ? `Чек №${orderId}` : `Заказ №${orderId}`}</title>
</svelte:head>

<div class="flex h-dvh flex-col bg-slate-50 print:hidden">
	<header class="shrink-0 px-4 py-3 text-white" style="background-color: {hallColor}">
		<div class="flex items-center gap-3">
			<a href="/waiter" aria-label="Назад" class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/30 bg-black/20 text-xl font-bold">←</a>
			<span class="min-w-0 flex-1 truncate text-base font-semibold">{hallName}</span>
			{#if showHome}
				<a
					href="/"
					aria-label="Выбор роли"
					class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/30 bg-black/20"
				>
					<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
					</svg>
				</a>
			{/if}
		</div>
	</header>

	<div class="flex min-h-0 flex-1 flex-col">
		<div class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
			<div class="min-w-0 flex-1">
				<p class="text-lg font-bold uppercase tracking-wide text-emerald-600">
					{isClosed ? 'Чек' : 'Заказ'}
				</p>
				<p class="truncate text-lg font-bold">
					{itemCount} поз. — <span class="text-rose-600 text-xl">{formatMoney(totalCents)}</span>
				</p>
			</div>
			{#if !isClosed}
				<button
					type="button"
					class="flex h-12 shrink-0 items-center gap-1.5 rounded-md border px-4 font-bold text-white {menuOpen
						? 'border-slate-800 bg-slate-700'
						: 'border-emerald-800 bg-emerald-600'}"
					aria-label={menuOpen ? 'Свернуть меню' : 'Открыть меню'}
					onclick={() => (menuOpen = !menuOpen)}
				>
					<span class="text-sm">{menuOpen ? 'Свернуть' : 'Меню'}</span>
					{#if menuOpen}
						<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5">
							<path d="M6 9l6 6 6-6" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5">
							<path d="M18 15l-6-6-6 6" />
						</svg>
					{/if}
				</button>
			{/if}
		</div>

		{#if error}
			<p class="px-4 pt-3 text-sm text-rose-600">{error}</p>
		{/if}
		{#if !shiftOpen && !isClosed}
			<p class="px-4 pt-3 text-sm text-amber-700">Смена закрыта — отправка и оплата недоступны</p>
		{/if}

		<div class="relative min-h-0 flex-1 overflow-hidden">
			<div class="flex h-full min-h-0 flex-col">
				<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<OrderItems
						guests={guests.map((g) => ({ id: g.id, name: g.name, is_paid: g.is_paid }))}
						{items}
						activeGuestId={guestId}
						{splitMode}
						readOnly={isClosed}
						onInc={(id) => changeQty(id, 'inc')}
						onDec={(id) => changeQty(id, 'dec')}
						onDelete={removeItem}
						onMove={requestMove}
						onRename={renameGuest}
						onSelectGuest={selectGuest}
						onRemoveGuest={removeGuest}
					/>
				</div>
				<div class="shrink-0 border-t border-slate-200 bg-white p-4 print:hidden">
					{#if isClosed}
						<button
							type="button"
							onclick={printCheck}
							class="h-12 w-full rounded-md border border-slate-700 bg-slate-600 text-base font-bold text-white"
						>
							Печать
						</button>
					{:else}
						{#if guests.length > 1}
							<button
								type="button"
								onclick={() => {
									splitMode = !splitMode;
									if (splitMode) menuOpen = false;
								}}
								class="mb-2 h-12 w-full rounded-md border text-base font-bold {splitMode
									? 'border-violet-800 bg-violet-600 text-white'
									: 'border-slate-300 bg-white text-slate-800'}"
							>
								{splitMode ? 'Готово' : 'Разделить'}
							</button>
						{/if}
						<div class="grid grid-cols-4 gap-2">
							<button type="button" onclick={addGuest} class="h-12 rounded-md border border-violet-800 bg-violet-600 text-base font-bold text-white">
								+ Гость
							</button>
							<button type="button" onclick={printCheck} class="h-12 rounded-md border border-slate-700 bg-slate-600 text-base font-bold text-white">
								Печать
							</button>
							<button
								type="button"
								onclick={fire}
								disabled={heldCount === 0}
								class="h-12 rounded-md border text-base font-bold {heldCount === 0
									? 'border-slate-200 bg-transparent text-slate-400'
									: 'border-sky-800 bg-sky-600 text-white'}"
							>
								На кухню
							</button>
							<button type="button" onclick={openPay} class="h-12 rounded-md border border-emerald-800 bg-emerald-600 text-base font-bold text-white">
								Оплата
							</button>
						</div>
					{/if}
				</div>
			</div>

			{#if !isClosed}
				<MenuSheet
					bind:open={menuOpen}
					{categories}
					{menu}
					{qtyInCheck}
					onAddItem={(item) => void addMenuItem(item)}
					onCustomOpen={() => (customOpen = true)}
				/>
			{/if}
		</div>
	</div>
</div>

{#if customOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="w-full max-w-sm rounded-md border border-slate-300 bg-slate-100 p-4">
			<p class="font-semibold">Произвольный товар</p>
			<input bind:value={customTitle} placeholder="Название" class="mt-4 h-12 w-full rounded-md border border-slate-300 bg-white px-4" />
			<div class="mt-4 flex items-center gap-2">
				<button type="button" class="h-12 w-12 rounded-md border border-slate-300 bg-white" onclick={() => (customQty = Math.max(1, customQty - 1))}
					>−</button
				>
				<span class="w-8 text-center">{customQty}</span>
				<button type="button" class="h-12 w-12 rounded-md border border-slate-300 bg-white" onclick={() => (customQty += 1)}>+</button>
			</div>
			<p class="mt-4 text-sm text-slate-500">Цена, {currencySymbol()}</p>
			<p class="mb-3 font-mono text-2xl">{customPrice || '0'} {currencySymbol()}</p>
			<PinPad bind:value={customPrice} maxLength={10} />
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button type="button" class="h-12 rounded-md border border-slate-300 bg-white" onclick={() => (customOpen = false)}>Закрыть</button>
				<button type="button" class="h-12 rounded-md border border-emerald-800 bg-emerald-600 font-semibold text-white" onclick={addCustom}>Добавить</button>
			</div>
		</div>
	</div>
{/if}

{#if moveItem}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="w-full max-w-sm rounded-md border border-slate-300 bg-slate-100 p-4">
			<p class="font-semibold">Перенос: {moveItem.title}</p>
			<label class="mt-4 block text-sm text-slate-500">
				Сколько перенести (1…{moveItem.quantity})
				<input bind:value={moveQty} type="number" min="1" max={moveItem.quantity} class="mt-3 h-12 w-full rounded-md border border-slate-300 bg-white px-4" />
			</label>
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button
					type="button"
					class="h-12 rounded-md border border-slate-300 bg-white"
					onclick={() => {
						moveItem = null;
						moveToGuestId = null;
					}}>Отмена</button
				>
				<button type="button" class="h-12 rounded-md border border-emerald-800 bg-emerald-600 font-semibold text-white" onclick={confirmMove}
					>Перенести</button
				>
			</div>
		</div>
	</div>
{/if}

{#if payOpen}
	<PayDialog
		{guests}
		bind:payGuestId
		bind:payMethod
		bind:cashIn
		{guestTotal}
		{hallQrPath}
		error={payError}
		onClose={() => {
			payOpen = false;
			payError = null;
		}}
		onConfirm={() => void pay()}
	/>
{/if}

<div class="hidden print:block">
	<article class="mx-auto max-w-[280px] text-black">
		<p class="text-center text-lg font-bold">{hallName}</p>
		<p class="text-center text-sm font-semibold">
			{isDraft ? 'Новый заказ' : isClosed ? `Чек №${orderId}` : `Заказ №${orderId}`}
		</p>
		<p class="text-center text-xs">{printWhen()}</p>
		<hr class="my-2 border-black" />
		{#each guests as guest}
			<p class="mt-2 text-sm font-bold">{guest.name}</p>
			{#each items.filter((i) => i.guest_id === guest.id) as item}
				<div class="flex justify-between gap-2 text-sm">
					<span>{item.quantity}× {item.title}</span>
					<span class="font-mono">{formatMoney(item.price_cents * item.quantity)}</span>
				</div>
			{/each}
		{/each}
		<hr class="my-2 border-black" />
		<p class="flex justify-between text-base font-bold">
			<span>Итого</span>
			<span class="font-mono">{formatMoney(totalCents)}</span>
		</p>
		{#if hallQrPath}
			<img src={imageUrl(hallQrPath)} alt="QR" class="mx-auto mt-4 h-80 w-80 object-contain" />
		{/if}
	</article>
</div>
