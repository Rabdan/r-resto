<script lang="ts">
	import { onMount } from 'svelte';
	import { CURRENCIES, CURRENCY_CODES } from '$lib/currency';
	import { formatMoney, setCurrency } from '$lib/money';
	import { TIMEZONES, timezoneOffsetLabel, setTimezone } from '$lib/timezone';
	import { formatDbDateTime } from '$lib/time';
	import AdminSwitch from '$lib/components/admin/AdminSwitch.svelte';

	const PRESETS = [
		'#065F46',
		'#0F766E',
		'#7C3AED',
		'#0EA5E9',
		'#D97706',
		'#DC2626',
		'#0891B2',
		'#EA580C',
		'#4F46E5',
		'#0D9488',
		'#65A30D',
		'#64748B'
	];

	type Hall = {
		id: number;
		name: string;
		color_hex: string;
		sort_order: number;
		is_active: number;
		closed_at: string | null;
		orders_count: number;
		qr_image_path: string | null;
	};

	let current = $state<string>('');
	let currentTimezone = $state<string>('UTC');
	let saving = $state(false);
	let message = $state<string | null>(null);

	let halls = $state<Hall[]>([]);
	let hallOpen = $state(false);
	let hallName = $state('');
	let hallColor = $state(PRESETS[0]);
	let editingHall = $state<number | null>(null);
	let editName = $state('');
	let editColor = $state('');
	let editActive = $state(true);

	onMount(async () => {
		const res = await fetch('/api/settings');
		if (res.ok) {
			const data = await res.json();
			current = data.currency ?? '';
			setCurrency(current);
			currentTimezone = data.timezone ?? 'UTC';
			setTimezone(currentTimezone);
		}
		await loadHalls();
	});

	async function loadHalls() {
		const res = await fetch('/api/admin/halls');
		if (res.ok) {
			const data = await res.json();
			halls = data.halls ?? [];
		}
	}

	async function choose(code: string) {
		saving = true;
		message = null;
		const res = await fetch('/api/settings', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ currency: code })
		});
		saving = false;
		if (!res.ok) {
			message = 'Не удалось сохранить валюту';
			return;
		}
		const data = await res.json();
		current = data.currency;
		setCurrency(current);
		message = 'Валюта сохранена';
	}

	async function chooseTimezone(value: string) {
		saving = true;
		message = null;
		const res = await fetch('/api/settings', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ timezone: value })
		});
		saving = false;
		if (!res.ok) {
			message = 'Не удалось сохранить часовой пояс';
			return;
		}
		const data = await res.json();
		currentTimezone = data.timezone;
		setTimezone(currentTimezone);
		message = 'Часовой пояс сохранён';
	}

	async function addHall() {
		if (!hallName.trim()) {
			message = 'Укажи название зала';
			return;
		}
		const res = await fetch('/api/admin/halls', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: hallName.trim(), color_hex: hallColor })
		});
		if (!res.ok) {
			message = 'Не удалось добавить зал';
			return;
		}
		hallName = '';
		hallOpen = false;
		await loadHalls();
	}

	function startEdit(hall: Hall) {
		editingHall = hall.id;
		editName = hall.name;
		editColor = hall.color_hex;
		editActive = hall.is_active === 1;
	}

	async function saveHall(hall: Hall) {
		const res = await fetch(`/api/admin/halls/${hall.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: editName.trim(), color_hex: editColor, is_active: editActive })
		});
		if (!res.ok) {
			message = 'Не удалось сохранить зал';
			return;
		}
		editingHall = null;
		await loadHalls();
	}

	async function deleteHall(hall: Hall) {
		const msg =
			hall.orders_count > 0
				? `В зале «${hall.name}» есть заказы: зал будет заблокирован, история сохранится. Продолжить?`
				: `Удалить зал «${hall.name}»?`;
		if (!confirm(msg)) return;
		const res = await fetch(`/api/admin/halls/${hall.id}`, { method: 'DELETE' });
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			message = 'Не удалось удалить зал';
			return;
		}
		editingHall = null;
		message = data.blocked ? 'Зал заблокирован — по нему есть заказы' : 'Зал удалён';
		await loadHalls();
	}

	function imageUrl(path: string | null): string {
		return path ? `/api/uploads/${path}` : '';
	}

	async function uploadHallQr(hall: Hall, file: File) {
		message = null;
		const fd = new FormData();
		fd.append('file', file);
		const res = await fetch(`/api/admin/halls/${hall.id}/qr`, { method: 'POST', body: fd });
		if (!res.ok) {
			message = 'Не удалось загрузить QR';
			return;
		}
		await loadHalls();
	}

	async function deleteHallQr(hall: Hall) {
		message = null;
		const res = await fetch(`/api/admin/halls/${hall.id}/qr`, { method: 'DELETE' });
		if (!res.ok) {
			message = 'Не удалось удалить QR';
			return;
		}
		await loadHalls();
	}
</script>

<header class="bg-slate-50 px-4 py-3 font-semibold">Настройки</header>

<div class="space-y-6 px-4 py-4">
	<section>
		<h2 class="text-sm uppercase tracking-wide text-slate-500">Валюта</h2>
		<div class="mt-2 space-y-2">
			{#each CURRENCY_CODES as code}
				<button
					type="button"
					onclick={() => choose(code)}
					disabled={saving}
					class="flex h-10 w-full items-center justify-between rounded-md px-4 text-sm font-semibold {code === current
						? 'bg-emerald-600 text-white'
						: 'bg-white text-slate-700'}"
				>
					<span>{CURRENCIES[code].label}</span>
					<span class="text-sm font-normal opacity-80">
						{CURRENCIES[code].symbol} · {code}
					</span>
				</button>
			{/each}
		</div>
		{#if current}
			<p class="mt-2 text-sm text-slate-500">Пример: {formatMoney(120000)}</p>
		{/if}
	</section>

	<section>
		<h2 class="text-sm uppercase tracking-wide text-slate-500">Часовой пояс</h2>
		<select
			bind:value={currentTimezone}
			onchange={() => chooseTimezone(currentTimezone)}
			disabled={saving}
			class="mt-2 h-10 w-full rounded-md bg-white px-3 text-sm text-slate-700"
		>
			{#each TIMEZONES as tz}
				<option value={tz.value}>{tz.label}{timezoneOffsetLabel(tz.value)}</option>
			{/each}
		</select>
		<p class="mt-2 text-sm text-slate-500">
			Сейчас: {formatDbDateTime(new Date().toISOString().slice(0, 19).replace('T', ' '))}
		</p>
	</section>

	<section>
		<h2 class="text-sm uppercase tracking-wide text-slate-500">Торговые залы</h2>
		<button
			type="button"
			onclick={() => {
				hallOpen = !hallOpen;
				message = null;
			}}
			class="mt-2 h-10 w-full rounded-md bg-emerald-600 text-sm font-semibold text-white"
		>
			{hallOpen ? 'Закрыть форму' : '+ Добавить зал'}
		</button>

		{#if hallOpen}
			<div class="mt-2 space-y-3 rounded-md border border-slate-200 bg-white p-4">
				<label class="block text-sm text-slate-700">
					Название
					<input bind:value={hallName} class="mt-1 h-10 w-full rounded-md bg-slate-100 px-3" placeholder="Главный зал" />
				</label>
				<p class="text-sm text-slate-700">Цвет</p>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each PRESETS as color}
						<button
							type="button"
							onclick={() => (hallColor = color)}
							class="h-10 w-10 rounded-md {hallColor === color ? 'ring-2 ring-slate-900 ring-offset-2' : ''}"
							style="background-color: {color}"
							aria-label={color}
						></button>
					{/each}
				</div>
				<button type="button" onclick={() => void addHall()} class="h-10 w-full rounded-md bg-slate-800 text-sm font-semibold text-white">
					Добавить
				</button>
			</div>
		{/if}

		<ul class="mt-2 space-y-2">
			{#each halls as hall}
				<li class="rounded-md border border-slate-200 bg-white p-3">
					{#if editingHall === hall.id}
						<label class="block text-sm text-slate-700">
							Название
							<input bind:value={editName} class="mt-1 h-10 w-full rounded-md bg-slate-100 px-3" />
						</label>
						<p class="mt-2 text-sm text-slate-700">Цвет</p>
						<div class="mt-1 flex flex-wrap gap-2">
							{#each PRESETS as color}
								<button
									type="button"
									onclick={() => (editColor = color)}
									class="h-9 w-9 rounded-md {editColor === color ? 'ring-2 ring-slate-900 ring-offset-2' : ''}"
									style="background-color: {color}"
									aria-label={color}
								></button>
							{/each}
						</div>
						<p class="mt-3 text-sm text-slate-700">QR для безнала и печати заказа</p>
						<div class="mt-2 flex items-center gap-3">
							{#if hall.qr_image_path}
								<img src={imageUrl(hall.qr_image_path)} alt="QR зала" class="h-20 w-20 rounded object-contain bg-slate-100" />
							{:else}
								<div class="flex h-20 w-20 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
									нет QR
								</div>
							{/if}
							<div class="flex flex-col gap-2">
								<label class="flex h-10 cursor-pointer items-center rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-700">
									Выбрать картинку
									<input
										type="file"
										accept="image/jpeg,image/png,image/webp,image/gif"
										class="hidden"
										onchange={(e) => {
											const f = (e.currentTarget as HTMLInputElement).files?.[0];
											if (f) void uploadHallQr(hall, f);
											e.currentTarget.value = '';
										}}
									/>
								</label>
								{#if hall.qr_image_path}
									<button
										type="button"
										onclick={() => void deleteHallQr(hall)}
										class="h-10 rounded-md bg-white px-3 text-sm text-rose-600"
									>
										Удалить QR
									</button>
								{/if}
							</div>
						</div>
						<div class="mt-3">
							<AdminSwitch
								label={editActive ? 'Активен' : 'Заблокирован'}
								checked={editActive}
								onchange={(next) => (editActive = next)}
							/>
						</div>
						<div class="mt-3 grid grid-cols-2 gap-2">
							<button type="button" onclick={() => (editingHall = null)} class="h-10 rounded-md bg-white text-sm">Отмена</button>
							<button type="button" onclick={() => void saveHall(hall)} class="h-10 rounded-md bg-emerald-600 text-sm font-semibold text-white">
								Сохранить
							</button>
						</div>
						<button
							type="button"
							onclick={() => void deleteHall(hall)}
							class="mt-2 h-10 w-full rounded-md bg-rose-100 text-sm font-semibold text-rose-700"
						>
							Удалить
						</button>
					{:else}
						<div class="flex items-center gap-3">
							<span class="h-4 w-4 shrink-0 rounded" style="background-color: {hall.color_hex}"></span>
							<div class="min-w-0 flex-1">
								<p class="truncate font-semibold">{hall.name}</p>
								<p class="text-xs text-slate-500">
									{hall.is_active === 1 ? 'Активен' : 'Заблокирован'}
									{#if hall.orders_count > 0} · движений: {hall.orders_count}{/if}
									{#if hall.qr_image_path} · QR{/if}
								</p>
							</div>
							<button
								type="button"
								onclick={() => startEdit(hall)}
								class="flex h-10 w-10 items-center justify-center rounded text-slate-500"
								aria-label="Изменить"
							>
								✎
							</button>
						</div>
					{/if}
				</li>
			{:else}
				<li class="text-slate-500">Залов пока нет</li>
			{/each}
		</ul>
	</section>

	{#if message}
		<p class="text-sm text-emerald-600">{message}</p>
	{/if}
</div>
