<script lang="ts">
	import { onMount } from 'svelte';

	type Staff = {
		id: number;
		name: string;
		role: 'staff' | 'admin';
		is_active: number;
		is_blocked: number;
		is_superadmin: number;
		has_pin: number;
	};
	type Device = {
		id: number;
		device_code: string;
		device_name: string | null;
		status: string;
		role: string | null;
		assigned_user_id: number | null;
		user_name: string | null;
		blocked_at: string | null;
	};

	const PIN_WARNING =
		'При вводе пароля сотруднику дается полный админ доступ, будьте осторожнее, при вводе 0000, пароль и админка для сотрудника отменяется.';

	let staff = $state<Staff[]>([]);
	let devices = $state<Device[]>([]);
	let error = $state<string | null>(null);
	let message = $state<string | null>(null);

	let createOpen = $state(false);
	let newName = $state('');
	let newPin = $state('');

	let openId = $state<number | null>(null);
	let editName = $state('');
	let editPin = $state('');
	let deleting = $state(false);

	let bindCode = $state('');
	let bindRole = $state<'waiter' | 'kitchen'>('waiter');

	const selected = $derived(staff.find((s) => s.id === openId) ?? null);
	const selectedDevices = $derived(devices.filter((d) => d.assigned_user_id === openId));

	onMount(() => {
		void load();
	});

	async function load() {
		const res = await fetch('/api/admin/staff');
		if (!res.ok) {
			error = 'Нет доступа';
			return;
		}
		const data = await res.json();
		staff = data.staff ?? [];
		devices = data.devices ?? [];
		if (openId && !staff.some((s) => s.id === openId)) openId = null;
	}

	function openStaff(s: Staff) {
		openId = s.id;
		editName = s.name;
		editPin = '';
		bindCode = '';
		bindRole = 'waiter';
		error = null;
		message = null;
	}

	function close() {
		openId = null;
	}

	async function createStaff() {
		error = null;
		if (!newName.trim()) {
			error = 'Укажи имя сотрудника';
			return;
		}
		const res = await fetch('/api/admin/staff', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: newName.trim(), pin: newPin })
		});
		const data = await res.json();
		if (!res.ok) {
			error = data.error ?? 'Ошибка создания';
			return;
		}
		newName = '';
		newPin = '';
		createOpen = false;
		message = 'Сотрудник добавлен';
		await load();
	}

	async function saveStaff() {
		error = null;
		if (!selected || !editName.trim()) {
			error = 'Укажи имя сотрудника';
			return;
		}
		const res = await fetch(`/api/admin/staff/${selected.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: editName.trim(), pin: editPin })
		});
		const data = await res.json();
		if (!res.ok) {
			error = data.error ?? 'Ошибка сохранения';
			return;
		}
		message = 'Сохранено';
		await load();
	}

	async function blockStaff() {
		if (!selected) return;
		error = null;
		const res = await fetch(`/api/admin/staff/${selected.id}/block`, { method: 'POST' });
		const data = await res.json();
		if (!res.ok) {
			error = data.error ?? 'Не удалось заблокировать';
			return;
		}
		message = 'Сотрудник заблокирован';
		await load();
	}

	async function unblockStaff() {
		if (!selected) return;
		error = null;
		const res = await fetch(`/api/admin/staff/${selected.id}/unblock`, { method: 'POST' });
		if (!res.ok) {
			error = 'Не удалось разблокировать';
			return;
		}
		message = 'Сотрудник разблокирован';
		await load();
	}

	async function removeStaff() {
		if (!selected) return;
		if (!confirm(`Удалить сотрудника «${selected.name}»?`)) return;
		deleting = true;
		const res = await fetch(`/api/admin/staff/${selected.id}`, { method: 'DELETE' });
		deleting = false;
		const data = await res.json();
		if (!res.ok) {
			error = data.error ?? 'Ошибка удаления';
			return;
		}
		message = 'Сотрудник удалён';
		await load();
	}

	async function restoreStaff() {
		if (!selected) return;
		const res = await fetch(`/api/admin/staff/${selected.id}/restore`, { method: 'POST' });
		if (!res.ok) {
			error = 'Не удалось восстановить';
			return;
		}
		message = 'Сотрудник восстановлен';
		await load();
	}

	async function setDeviceStatus(device: Device, status: 'active' | 'suspended') {
		error = null;
		const res = await fetch(`/api/admin/devices/${device.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status })
		});
		if (!res.ok) {
			error = 'Не удалось изменить статус устройства';
			return;
		}
		message = status === 'active' ? 'Устройство разблокировано' : 'Устройство заблокировано';
		await load();
	}

	async function bind() {
		error = null;
		if (!openId || !bindCode.trim()) {
			error = 'Введи код устройства';
			return;
		}
		const res = await fetch('/api/admin/devices/bind', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: bindCode.trim(), userId: openId, role: bindRole })
		});
		const data = await res.json();
		if (!res.ok) {
			error = data.error === 'device not found' ? 'Устройство с таким кодом не найдено' : (data.error ?? 'Ошибка привязки');
			return;
		}
		bindCode = '';
		message = 'Устройство привязано';
		await load();
	}

	function statusLabel(status: string): string {
		if (status === 'active') return 'Активен';
		if (status === 'pending') return 'Ожидает';
		if (status === 'suspended') return 'Приостановлен';
		if (status === 'terminated') return 'Уволен';
		return status;
	}

	function deviceRoleLabel(role: string | null): string {
		if (role === 'waiter') return 'Официант';
		if (role === 'kitchen') return 'Кухня';
		return '—';
	}

	function datetimeLabel(dbTime: string | null | undefined): string {
		if (!dbTime) return '—';
		const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dbTime);
		if (!m) return dbTime;
		return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}`;
	}
</script>

<header class="bg-slate-50 px-4 py-3 font-semibold">Персонал и устройства</header>

<div class="space-y-4 px-4 py-4">
	<button
		type="button"
		onclick={() => {
			createOpen = !createOpen;
			error = null;
		}}
		class="h-12 w-full rounded-md bg-emerald-600 font-semibold text-white"
	>
		{createOpen ? 'Закрыть форму' : '+ Добавить сотрудника'}
	</button>

	{#if createOpen}
		<form
			class="space-y-3 rounded-md border border-slate-200 bg-white p-4"
			onsubmit={(e) => {
				e.preventDefault();
				void createStaff();
			}}
		>
			<label class="block text-sm text-slate-700">
				Имя
				<input bind:value={newName} class="mt-1 h-12 w-full rounded-md bg-slate-100 px-3" placeholder="Имя сотрудника" />
			</label>
			<label class="block text-sm text-slate-700">
				Пароль админки
				<input
					bind:value={newPin}
					type="password"
					inputmode="numeric"
					maxlength="8"
					autocomplete="new-password"
					class="mt-1 h-12 w-full rounded-md bg-slate-100 px-3"
					placeholder="4–8 цифр, пусто — без доступа"
				/>
			</label>
			<p class="text-xs text-amber-700">{PIN_WARNING}</p>
			<button class="h-12 w-full rounded-md bg-emerald-600 font-semibold text-white">Создать</button>
		</form>
	{/if}

	{#if error}
		<p class="text-sm text-rose-600">{error}</p>
	{/if}
	{#if message}
		<p class="text-sm text-emerald-600">{message}</p>
	{/if}

	<h2 class="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Сотрудники</h2>
	<ul class="space-y-2">
		{#each staff as s}
			<li>
				<button
					type="button"
					onclick={() => openStaff(s)}
					class="flex h-14 w-full items-center justify-between rounded-md px-4 text-left bg-white text-slate-700"
				>
					<div class="min-w-0">
						<p class="truncate font-semibold">
							{s.name}
							{#if s.is_superadmin}
								<span class="ml-1 text-xs opacity-70">(владелец)</span>
							{/if}
							{#if s.role === 'admin'}
								<span class="ml-1 rounded bg-emerald-100 px-1 text-xs text-emerald-700">админ</span>
							{/if}
							{#if s.is_blocked === 1}
								<span class="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-700">заблокирован</span>
							{/if}
							{#if s.is_active !== 1}
								<span class="ml-1 rounded bg-rose-100 px-1 text-xs text-rose-700">удалён</span>
							{/if}
						</p>
						<p class="text-xs text-slate-500">
							{#if s.role === 'admin'}
								{s.has_pin ? 'есть доступ в админку' : 'нет доступа'}
							{:else}
								Сотрудник
							{/if}
						</p>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs text-slate-500">{devices.filter((d) => d.assigned_user_id === s.id).length} устр.</span>
						<span class="text-lg text-slate-400">›</span>
					</div>
				</button>
			</li>
		{/each}
	</ul>
</div>

{#if selected}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center print:hidden">
		<div class="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-md bg-slate-100 p-4">
			<div class="flex items-center justify-between">
				<p class="text-lg font-bold">{selected.name}</p>
				<button type="button" onclick={close} class="flex h-10 w-10 items-center justify-center rounded-md bg-white text-slate-500" aria-label="Закрыть">
					✕
				</button>
			</div>

			{#if error}
				<p class="mt-2 text-sm text-rose-600">{error}</p>
			{/if}
			{#if message}
				<p class="mt-2 text-sm text-emerald-600">{message}</p>
			{/if}

			<div class="mt-3 space-y-3">
				<label class="block text-sm text-slate-700">
					Имя
					<input bind:value={editName} class="mt-1 h-12 w-full rounded-md bg-white px-3" />
				</label>

				{#if selected.is_superadmin !== 1}
					<label class="block text-sm text-slate-700">
						Пароль админки
						<input
							bind:value={editPin}
							type="password"
							inputmode="numeric"
							maxlength="8"
							autocomplete="new-password"
							class="mt-1 h-12 w-full rounded-md bg-white px-3"
							placeholder={selected.has_pin ? 'задан · введи новый, чтобы сменить' : 'не задан'}
						/>
					</label>
					<p class="text-xs text-amber-700">{PIN_WARNING}</p>
				{/if}
			</div>

			{#if selected.is_active === 1}
				<div class="mt-4 border-t border-slate-200 pt-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Устройства</p>
					<ul class="mt-2 space-y-2">
						{#each selectedDevices as d}
							<li class="rounded-md bg-white p-3">
								<div class="flex items-center justify-between gap-2">
									<span class="font-mono text-sm">{d.device_code}</span>
									<span class="text-xs text-slate-500">{deviceRoleLabel(d.role)}</span>
								</div>
								<p class="mt-1 text-xs text-slate-500">
									{statusLabel(d.status)} · заблокировано: {datetimeLabel(d.blocked_at)}
								</p>
								<div class="mt-2">
									{#if d.status === 'active'}
										<button
											type="button"
											onclick={() => setDeviceStatus(d, 'suspended')}
											class="h-10 w-full rounded-md bg-rose-100 text-sm font-semibold text-rose-700"
										>
											Заблокировать устройство
										</button>
									{:else}
										<button
											type="button"
											onclick={() => setDeviceStatus(d, 'active')}
											class="h-10 w-full rounded-md bg-emerald-100 text-sm font-semibold text-emerald-700"
										>
											Разблокировать устройство
										</button>
									{/if}
								</div>
							</li>
						{:else}
							<li class="text-sm text-slate-500">Нет привязанных устройств</li>
						{/each}
					</ul>

					<form
						class="mt-3 space-y-2 rounded-md bg-white p-3"
						onsubmit={(e) => {
							e.preventDefault();
							void bind();
						}}
					>
						<label class="block text-sm text-slate-700">
							Код устройства
							<input
								bind:value={bindCode}
								class="mt-1 h-12 w-full rounded-md bg-slate-100 px-3 font-mono tracking-widest"
								placeholder="481-902"
							/>
						</label>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								onclick={() => (bindRole = 'waiter')}
								class="h-12 rounded-md text-sm font-semibold {bindRole === 'waiter'
									? 'bg-slate-800 text-white'
									: 'bg-slate-100 text-slate-700'}"
							>
								Официант
							</button>
							<button
								type="button"
								onclick={() => (bindRole = 'kitchen')}
								class="h-12 rounded-md text-sm font-semibold {bindRole === 'kitchen'
									? 'bg-slate-800 text-white'
									: 'bg-slate-100 text-slate-700'}"
							>
								Кухня
							</button>
						</div>
						<button class="h-12 w-full rounded-md bg-emerald-600 font-semibold text-white">Привязать</button>
					</form>
				</div>
			{/if}

			<div class="mt-4 space-y-2 border-t border-slate-200 pt-3">
				<button class="h-12 w-full rounded-md bg-slate-800 font-semibold text-white" onclick={() => saveStaff()}>
					Сохранить
				</button>

				{#if selected.is_superadmin !== 1}
					{#if selected.is_blocked === 1}
						<button
							type="button"
							onclick={() => unblockStaff()}
							class="h-12 w-full rounded-md bg-emerald-100 font-semibold text-emerald-700"
						>
							Разблокировать сотрудника
						</button>
					{:else}
						<button
							type="button"
							onclick={() => blockStaff()}
							class="h-12 w-full rounded-md bg-amber-100 font-semibold text-amber-700"
						>
							Заблокировать сотрудника
						</button>
					{/if}

					{#if selected.is_active === 1}
						<button
							type="button"
							onclick={() => removeStaff()}
							disabled={deleting}
							class="h-12 w-full rounded-md bg-rose-100 font-semibold text-rose-700 disabled:opacity-50"
						>
							Удалить
						</button>
					{:else}
						<button
							type="button"
							onclick={() => restoreStaff()}
							class="h-12 w-full rounded-md bg-emerald-100 font-semibold text-emerald-700"
						>
							Восстановить
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}
