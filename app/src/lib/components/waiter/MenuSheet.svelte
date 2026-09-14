<script lang="ts">
	import { formatMoney } from '$lib/money';

	export type MenuSheetCategory = { id: number; name: string; color_hex: string };
	export type MenuSheetItem = {
		id: number;
		category_id: number;
		title: string;
		price_cents: number;
		image_path: string | null;
		is_available: number;
	};

	let {
		open = $bindable(false),
		categories,
		menu,
		qtyInCheck,
		onAddItem,
		onCustomOpen
	}: {
		open: boolean;
		categories: MenuSheetCategory[];
		menu: MenuSheetItem[];
		qtyInCheck: (menuItemId: number) => number;
		onAddItem: (item: MenuSheetItem) => void;
		onCustomOpen: () => void;
	} = $props();

	let categoryId = $state<number | 'all'>('all');
	let dragging = $state(false);
	let dragY = $state(0);
	let startY = 0;

	const visibleMenu = $derived.by(() => {
		return menu.filter((item) => {
			if (categoryId !== 'all' && item.category_id !== categoryId) return false;
			return true;
		});
	});

	function categoryHex(id: number): string {
		return categories.find((c) => c.id === id)?.color_hex ?? '#334155';
	}

	function lighten(hex: string, factor: number): string {
		const clean = hex.replace('#', '');
		if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
		const r = parseInt(clean.slice(0, 2), 16);
		const g = parseInt(clean.slice(2, 4), 16);
		const b = parseInt(clean.slice(4, 6), 16);
		const mix = (v: number) => Math.round(v + (255 - v) * factor);
		return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
	}

	function hexWithAlpha(hex: string, alpha: number): string {
		const clean = hex.replace('#', '');
		if (!/^[0-9a-fA-F]{6}$/.test(clean)) return `rgba(15, 23, 42, ${alpha})`;
		const a = Math.round(alpha * 255)
			.toString(16)
			.padStart(2, '0');
		return `#${clean}${a}`;
	}

	function imageUrl(path: string | null): string {
		return path ? `/api/uploads/${path}` : '';
	}

	function tileBackground(item: MenuSheetItem): string {
		const hex = categoryHex(item.category_id);
		if (item.image_path) {
			const overlay = hexWithAlpha(hex, 0.55);
			return `background-color: ${hex}; background-image: linear-gradient(${overlay}, ${overlay}), url('${imageUrl(item.image_path)}'); background-size: cover; background-position: center;`;
		}
		return `background-color: ${hex}`;
	}

	function onHandleDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
		startY = e.clientY;
		dragY = 0;
	}

	function onHandleMove(e: PointerEvent) {
		if (!dragging) return;
		dragY = Math.max(0, e.clientY - startY);
	}

	function onHandleUp() {
		if (!dragging) return;
		dragging = false;
		if (dragY > 80) {
			open = false;
		}
		dragY = 0;
	}
</script>

<div
	class="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-t-2xl bg-slate-50 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] {open
		? 'pointer-events-auto'
		: 'pointer-events-none'}"
	style="transform: {open
		? `translateY(${dragY}px)`
		: 'translateY(100%)'}; transition: {dragging ? 'none' : 'transform 0.22s ease-out'}"
	aria-hidden={!open}
	inert={!open}
>
	<div
		role="button"
		tabindex="0"
		aria-label="Свернуть меню"
		class="flex shrink-0 cursor-grab touch-none flex-col items-center bg-slate-50 px-4 pt-3 active:cursor-grabbing"
		style="touch-action: none"
		onpointerdown={onHandleDown}
		onpointermove={onHandleMove}
		onpointerup={onHandleUp}
		onpointercancel={onHandleUp}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				open = false;
			}
		}}
	>
		<div class="h-1.5 w-12 rounded-full bg-slate-300"></div>
	</div>

	<div class="shrink-0 px-4 pt-3 pb-3">
		<div class="flex gap-2 overflow-x-auto">
			<button
				type="button"
				onclick={() => (categoryId = 'all')}
				class="h-12 shrink-0 rounded-md border border-slate-400 px-4 text-[13px] font-bold {categoryId === 'all'
					? 'bg-slate-800 text-white'
					: 'bg-slate-200 text-slate-700'}"
			>
				Все
			</button>
			{#each categories as cat}
				<button
					type="button"
					onclick={() => (categoryId = cat.id)}
					class="h-12 shrink-0 rounded-md border border-black/25 px-4 text-[13px] font-bold {categoryId === cat.id
						? 'text-white'
						: 'text-slate-800'}"
					style={`background-color: ${categoryId === cat.id ? cat.color_hex : lighten(cat.color_hex, 0.55)}`}
				>
					{cat.name}
				</button>
			{/each}
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 pb-4">
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
			<button
				type="button"
				onclick={onCustomOpen}
				class="min-h-28 rounded-md border border-dashed border-slate-400 bg-white p-3 text-left text-slate-800"
			>
				<p class="text-[15px] font-bold">Произвольный товар</p>
				<p class="text-[12px] font-semibold text-slate-500">Ввести вручную</p>
			</button>
			{#each visibleMenu as item}
				<div
					role="button"
					tabindex="0"
					onclick={() => onAddItem(item)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onAddItem(item);
						}
					}}
					class="relative min-h-28 cursor-pointer touch-manipulation select-none overflow-hidden rounded-md border border-black/20 p-3 text-left text-white {item.is_available
						? ''
						: 'bg-slate-300 text-slate-500'}"
					style={item.is_available ? tileBackground(item) : ''}
				>
					{#if qtyInCheck(item.id) > 0}
						<span
							class="absolute right-2 top-2 z-10 flex h-8 min-w-8 items-center justify-center rounded-full border border-rose-200 bg-white px-1 text-sm font-extrabold text-rose-600 shadow"
						>
							{qtyInCheck(item.id)}
						</span>
					{/if}
					<div class="relative z-10">
						<p class="pr-10 text-[15px] font-bold leading-tight drop-shadow-sm">{item.title}</p>
						<p class="mt-1 text-[17px] font-extrabold drop-shadow-sm">{formatMoney(item.price_cents)}</p>
						{#if !item.is_available}
							<p class="mt-1 text-xs font-bold text-rose-700">Стоп-лист</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
