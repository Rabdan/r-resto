<script lang="ts">
	import { onMount } from 'svelte';
	import { CURRENCIES, DEFAULT_CURRENCY } from '$lib/currency';
	import { formatMoney, getCurrency, parseMoney } from '$lib/money';
	import AdminSwitch from '$lib/components/admin/AdminSwitch.svelte';

	type Item = {
		id: number;
		category_id: number;
		title: string;
		description: string;
		price_cents: number;
		image_path: string | null;
		is_available: number;
		is_active: number;
		sort_order: number;
	};
	type Category = {
		id: number;
		name: string;
		color_hex: string;
		sort_order: number;
		items: Item[];
	};

	type CatModal = { mode: 'create' | 'edit'; id: number | null; name: string; color: string };
	type ItemModal = {
		mode: 'create' | 'edit';
		id: number | null;
		categoryId: number;
		title: string;
		price: string;
		description: string;
		imagePath: string | null;
		isAvailable: boolean;
	};

	const PRESETS = [
		'#0F766E',
		'#7C3AED',
		'#0EA5E9',
		'#D97706',
		'#DC2626',
		'#0891B2',
		'#EA580C',
		'#C026D3',
		'#4F46E5',
		'#0D9488',
		'#65A30D',
		'#64748B'
	];

	let categories = $state<Category[]>([]);
	let collapsed = $state<number[]>([]);
	let error = $state<string | null>(null);
	let message = $state<string | null>(null);

	let catOpen = $state(false);
	let catModal = $state<CatModal>({
		mode: 'create',
		id: null,
		name: '',
		color: PRESETS[0]
	});
	let itemOpen = $state(false);
	let itemModal = $state<ItemModal>({
		mode: 'create',
		id: null,
		categoryId: 0,
		title: '',
		price: '',
		description: '',
		imagePath: null,
		isAvailable: true
	});

	let dragItem = $state<Item | null>(null);
	let dragOverCat = $state<number | null>(null);
	let dragMoved = false;
	let dragStart = { x: 0, y: 0 };

	onMount(() => {
		void load();
	});

	async function load() {
		const res = await fetch('/api/admin/menu');
		if (!res.ok) {
			error = 'Нет доступа';
			return;
		}
		const data = await res.json();
		categories = data.categories ?? [];
	}

	function majorUnits(cents: number): string {
		const cfg = CURRENCIES[getCurrency()] ?? CURRENCIES[DEFAULT_CURRENCY];
		const v = cents / cfg.minorUnits;
		return Number.isInteger(v) ? String(v) : v.toFixed(cfg.digits);
	}

	function imageUrl(path: string | null): string {
		return path ? `/api/uploads/${path}` : '';
	}

	function toggle(catId: number) {
		if (collapsed.includes(catId)) collapsed = collapsed.filter((id) => id !== catId);
		else collapsed = [...collapsed, catId];
	}

	function expand(catId: number) {
		if (collapsed.includes(catId)) collapsed = collapsed.filter((id) => id !== catId);
	}

	// --- category modal ---
	function openCreateCategory() {
		catModal = {
			mode: 'create',
			id: null,
			name: '',
			color: PRESETS[categories.length % PRESETS.length]
		};
		catOpen = true;
	}

	function openEditCategory(cat: Category) {
		catModal = { mode: 'edit', id: cat.id, name: cat.name, color: cat.color_hex };
		catOpen = true;
	}

	async function saveCategory() {
		const m = catModal;
		if (!m.name.trim()) {
			error = 'Укажи название категории';
			return;
		}
		const payload = { name: m.name.trim(), color_hex: m.color };
		const res =
			m.mode === 'create'
				? await fetch('/api/admin/menu/categories', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					})
				: await fetch(`/api/admin/menu/categories/${m.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					});
		if (!res.ok) {
			error = 'Не удалось сохранить категорию';
			return;
		}
		catOpen = false;
		message = m.mode === 'create' ? 'Категория добавлена' : 'Категория сохранена';
		await load();
	}

	// --- item modal ---
	function openCreateItem(catId: number) {
		itemModal = {
			mode: 'create',
			id: null,
			categoryId: catId,
			title: '',
			price: '',
			description: '',
			imagePath: null,
			isAvailable: true
		};
		itemOpen = true;
	}

	function openEditItem(item: Item) {
		itemModal = {
			mode: 'edit',
			id: item.id,
			categoryId: item.category_id,
			title: item.title,
			price: majorUnits(item.price_cents),
			description: item.description,
			imagePath: item.image_path,
			isAvailable: item.is_available === 1
		};
		itemOpen = true;
	}

	async function saveItem() {
		const m = itemModal;
		const price = parseMoney(m.price);
		if (!m.title.trim() || !m.price.trim() || !Number.isFinite(price) || price < 0) {
			error = 'Проверь название и цену';
			return;
		}
		const payload = {
			category_id: m.categoryId,
			title: m.title.trim(),
			price_cents: price,
			description: m.description,
			image_path: m.imagePath,
			is_available: m.isAvailable
		};
		const res =
			m.mode === 'create'
				? await fetch('/api/admin/menu/items', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					})
				: await fetch(`/api/admin/menu/items/${m.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					});
		if (!res.ok) {
			error = 'Не удалось сохранить товар';
			return;
		}
		itemOpen = false;
		expand(m.categoryId);
		await load();
	}

	async function uploadImage(file: File) {
		const fd = new FormData();
		fd.append('file', file);
		const res = await fetch('/api/admin/menu/upload', { method: 'POST', body: fd });
		if (!res.ok) {
			error = 'Не удалось загрузить изображение';
			return;
		}
		const data = await res.json();
		itemModal.imagePath = data.image_path;
	}

	// --- drag & drop between categories ---
	function dropCategoryUnder(e: PointerEvent): number | null {
		const el = document.elementFromPoint(e.clientX, e.clientY);
		const host = el?.closest('[data-cat-drop]') as HTMLElement | null;
		if (!host) return null;
		const id = Number(host.getAttribute('data-cat-id'));
		return Number.isFinite(id) ? id : null;
	}

	function itemPointerDown(e: PointerEvent, item: Item) {
		if ((e.target as HTMLElement).closest('button')) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragItem = item;
		dragMoved = false;
		dragStart = { x: e.clientX, y: e.clientY };
		dragOverCat = item.category_id;
	}

	function itemPointerMove(e: PointerEvent) {
		if (!dragItem) return;
		if (!dragMoved && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 8) {
			dragMoved = true;
		}
		const target = dropCategoryUnder(e);
		if (target != null) dragOverCat = target;
	}

	function itemPointerUp(e: PointerEvent) {
		const item = dragItem;
		const moved = dragMoved;
		const target = dropCategoryUnder(e);
		dragItem = null;
		dragOverCat = null;
		dragMoved = false;
		if (!item) return;
		if (moved && target != null && target !== item.category_id) {
			void moveItem(item, target);
		} else if (!moved) {
			openEditItem(item);
		}
	}

	async function moveItem(item: Item, categoryId: number) {
		const res = await fetch(`/api/admin/menu/items/${item.id}/move`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ category_id: categoryId })
		});
		if (!res.ok) {
			error = 'Не удалось перенести товар';
			return;
		}
		expand(categoryId);
		await load();
	}

	async function moveItemDirection(item: Item, direction: 'up' | 'down') {
		const res = await fetch(`/api/admin/menu/items/${item.id}/move`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ direction })
		});
		if (!res.ok) {
			error = 'Не удалось переставить товар';
			return;
		}
		await load();
	}

	async function moveCategoryDirection(cat: Category, direction: 'up' | 'down') {
		const res = await fetch(`/api/admin/menu/categories/${cat.id}/move`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ direction })
		});
		if (!res.ok) {
			error = 'Не удалось переставить категорию';
			return;
		}
		await load();
	}

	async function deleteItem(item: Item) {
		if (!confirm(`Удалить товар «${item.title}»?`)) return;
		const res = await fetch(`/api/admin/menu/items/${item.id}`, { method: 'DELETE' });
		if (!res.ok) {
			error = 'Не удалось удалить товар';
			return;
		}
		message = 'Товар удалён';
		await load();
	}

	async function deleteCategory(cat: Category) {
		const hasItems = cat.items.length > 0;
		const okToDelete = hasItems
			? confirm(`Удалить категорию «${cat.name}» и все ${cat.items.length} товаров?`)
			: confirm(`Удалить категорию «${cat.name}»?`);
		if (!okToDelete) return;
		const res = await fetch(`/api/admin/menu/categories/${cat.id}?deleteItems=1`, { method: 'DELETE' });
		if (!res.ok) {
			error = 'Не удалось удалить категорию';
			return;
		}
		message = 'Категория удалена';
		await load();
	}
</script>

<header class="bg-slate-50 px-4 py-3 font-semibold">Меню</header>

<div class="space-y-3 px-4 py-4">
	<button
		type="button"
		onclick={openCreateCategory}
		class="h-10 w-full rounded-md bg-emerald-600 text-sm font-semibold text-white"
	>
		+ Добавить категорию
	</button>

	{#if error}
		<p class="text-sm text-rose-600">{error}</p>
	{/if}
	{#if message}
		<p class="text-sm text-emerald-600">{message}</p>
	{/if}

	{#each categories as cat}
		<div
			data-cat-drop
			data-cat-id={cat.id}
			class="overflow-hidden rounded-md border-2 bg-white {dragOverCat === cat.id && dragItem?.category_id !== cat.id
				? 'border-emerald-500 ring-2 ring-emerald-200'
				: 'border-slate-200'}"
		>
			<div class="flex h-14 items-center gap-1 px-2" style="background-color: {cat.color_hex}">
				<button
					type="button"
					onclick={() => toggle(cat.id)}
					class="flex h-12 w-12 shrink-0 items-center justify-center text-lg font-bold text-white"
				>
					{collapsed.includes(cat.id) ? '▸' : '▾'}
				</button>
				<button
					type="button"
					onclick={() => openEditCategory(cat)}
					class="min-w-0 flex-1 truncate text-left text-base font-semibold text-white"
				>
					{cat.name}
				</button>
				<div class="flex shrink-0 flex-col">
					<button
						type="button"
						onclick={() => moveCategoryDirection(cat, 'up')}
						aria-label="Вверх"
						class="flex h-5 w-7 items-center justify-center text-xs text-white/70 hover:text-white"
					>
						▲
					</button>
					<button
						type="button"
						onclick={() => moveCategoryDirection(cat, 'down')}
						aria-label="Вниз"
						class="flex h-5 w-7 items-center justify-center text-xs text-white/70 hover:text-white"
					>
						▼
					</button>
				</div>
				<span class="shrink-0 px-1 text-xs font-semibold text-white/80">{cat.items.length}</span>
				<button
					type="button"
					onclick={() => openCreateItem(cat.id)}
					class="flex h-12 w-12 shrink-0 items-center justify-center text-2xl font-bold text-white"
					aria-label="Добавить товар"
				>
					+
				</button>
				<button
					type="button"
					onclick={() => deleteCategory(cat)}
					class="flex h-12 w-12 shrink-0 items-center justify-center text-white/80"
					aria-label="Удалить категорию"
				>
					<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6" />
					</svg>
				</button>
			</div>

			{#if !collapsed.includes(cat.id)}
				<ul class="divide-y divide-slate-100">
					{#each cat.items as item}
						<li>
							<div
								role="button"
								tabindex="0"
								class="flex min-h-14 cursor-grab touch-none items-center gap-3 px-3 py-2 active:cursor-grabbing {dragItem?.id ===
								item.id
									? 'opacity-40'
									: ''}"
								onpointerdown={(e) => itemPointerDown(e, item)}
								onpointermove={itemPointerMove}
								onpointerup={itemPointerUp}
								onpointercancel={itemPointerUp}
							>
								{#if item.image_path}
									<img
										src={imageUrl(item.image_path)}
										alt=""
										class="h-11 w-11 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400">
										<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M4 5h16v14H4z" />
											<circle cx="8.5" cy="9.5" r="1.5" />
											<path d="M4 18l5-5 3 3 4-4 4 4" />
										</svg>
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium">{item.title}</p>
									<p class="text-sm text-slate-500">
										{formatMoney(item.price_cents)}
										{#if item.is_available !== 1}
											<span class="ml-2 text-rose-600">Стоп-лист</span>
										{/if}
									</p>
								</div>
								<div class="flex shrink-0 flex-col">
									<button
										type="button"
										onclick={() => moveItemDirection(item, 'up')}
										aria-label="Вверх"
										class="flex h-5 w-8 items-center justify-center text-slate-400 hover:text-slate-700"
									>
										▲
									</button>
									<button
										type="button"
										onclick={() => moveItemDirection(item, 'down')}
										aria-label="Вниз"
										class="flex h-5 w-8 items-center justify-center text-slate-400 hover:text-slate-700"
									>
										▼
									</button>
								</div>
								<button
									type="button"
									onclick={() => deleteItem(item)}
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded text-slate-400 hover:text-rose-600"
									aria-label="Удалить товар"
								>
									<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6" />
									</svg>
								</button>
								<span class="text-slate-300">⠿</span>
							</div>
						</li>
					{:else}
						<li class="px-3 py-3 text-sm text-slate-500">Нет товаров. Нажми «+», чтобы добавить.</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/each}

	{#if categories.length === 0}
		<p class="py-4 text-center text-slate-500">Категорий пока нет</p>
	{/if}
</div>

{#if catOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="w-full max-w-sm rounded-md bg-slate-100 p-4">
			<p class="text-lg font-bold">{catModal.mode === 'create' ? 'Новая категория' : 'Категория'}</p>
			<label class="mt-3 block text-sm text-slate-700">
				Название
				<input bind:value={catModal.name} class="mt-1 h-10 w-full rounded-md bg-white px-3" />
			</label>
			<p class="mt-3 text-sm text-slate-700">Цвет</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each PRESETS as color}
					<button
						type="button"
						onclick={() => (catModal.color = color)}
						class="h-10 w-10 rounded-md {catModal.color === color ? 'ring-2 ring-slate-900 ring-offset-2' : ''}"
						style="background-color: {color}"
						aria-label={color}
					></button>
				{/each}
				<label class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-slate-300">
					<input
						type="color"
						bind:value={catModal.color}
						class="h-0 w-0 opacity-0"
						aria-label="Свой цвет"
					/>
					<span class="text-slate-400">+</span>
				</label>
			</div>
			<div class="mt-4 grid grid-cols-2 gap-2">
				<button type="button" class="h-10 rounded-md bg-white text-sm" onclick={() => (catOpen = false)}>Отмена</button>
				<button type="button" class="h-10 rounded-md bg-emerald-600 text-sm font-semibold text-white" onclick={() => saveCategory()}>
					Сохранить
				</button>
			</div>
		</div>
	</div>
{/if}

{#if itemOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-md bg-slate-100 p-4">
			<p class="text-lg font-bold">{itemModal.mode === 'create' ? 'Новый товар' : 'Товар'}</p>

			<div class="mt-3 flex items-center gap-3">
				{#if itemModal.imagePath}
					<img src={imageUrl(itemModal.imagePath)} alt="" class="h-16 w-16 rounded object-cover" />
				{:else}
					<div class="flex h-16 w-16 items-center justify-center rounded bg-slate-200 text-slate-400">
						<svg viewBox="0 0 24 24" class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M4 5h16v14H4z" />
							<circle cx="8.5" cy="9.5" r="1.5" />
							<path d="M4 18l5-5 3 3 4-4 4 4" />
						</svg>
					</div>
				{/if}
				<div class="flex flex-col gap-2">
					<label class="flex h-10 cursor-pointer items-center rounded-md bg-white px-3 text-sm font-semibold text-slate-700">
						📷 Изображение
						<input
							type="file"
							accept="image/*"
							class="hidden"
							onchange={(e) => {
								const f = (e.currentTarget as HTMLInputElement).files?.[0];
								if (f) void uploadImage(f);
							}}
						/>
					</label>
					{#if itemModal.imagePath}
						<button
							type="button"
							onclick={() => (itemModal.imagePath = null)}
							class="h-10 rounded-md bg-white px-3 text-sm text-rose-600"
						>
							Убрать фото
						</button>
					{/if}
				</div>
			</div>

			<label class="mt-3 block text-sm text-slate-700">
				Наименование
				<input bind:value={itemModal.title} class="mt-1 h-10 w-full rounded-md bg-white px-3" />
			</label>
			<label class="mt-3 block text-sm text-slate-700">
				Цена
				<input
					bind:value={itemModal.price}
					inputmode="decimal"
					class="mt-1 h-10 w-full rounded-md bg-white px-3"
					placeholder="0"
				/>
			</label>
			<label class="mt-3 block text-sm text-slate-700">
				Описание
				<textarea
					bind:value={itemModal.description}
					class="mt-1 h-20 w-full rounded-md bg-white px-3 py-2"
				></textarea>
			</label>

			<div class="mt-3">
				<AdminSwitch
					label={itemModal.isAvailable ? 'В наличии' : 'Стоп-лист'}
					checked={itemModal.isAvailable}
					onchange={(next) => (itemModal.isAvailable = next)}
				/>
			</div>

			<div class="mt-4 grid grid-cols-2 gap-2">
				<button type="button" class="h-10 rounded-md bg-white text-sm" onclick={() => (itemOpen = false)}>Отмена</button>
				<button type="button" class="h-10 rounded-md bg-emerald-600 text-sm font-semibold text-white" onclick={() => saveItem()}>
					Сохранить
				</button>
			</div>
		</div>
	</div>
{/if}
