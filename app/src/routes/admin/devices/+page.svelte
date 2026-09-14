<script lang="ts">
	import { onMount } from 'svelte';
	import AdminSwitch from '$lib/components/admin/AdminSwitch.svelte';
	import type { UserRole } from '$lib/types';

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
		roles: UserRole[];
		assigned_user_id: number | null;
		user_name: string | null;
		blocked_at: string | null;
		hall_ids: number[];
	};
	type Hall = { id: number; name: string; is_active: number };

	const PIN_WARNING =
		'При вводе пароля сотруднику дается полный админ доступ, будьте осторожнее, при вводе 0000, пароль и админка для сотрудника отменяется.';

	let staff = $state<Staff[]>([]);
	let devices = $state<Device[]>([]);
	let halls = $state<Hall[]>([]);
	let error = $state<string | null>(null);
	let message = $state<string | null>(null);

	let createOpen = $state(false);
	let newName = $state('');
	let newPin = $state('');
	let newAdmin = $state(false);

	let openId = $state<number | null>(null);
	let editName = $state('');
	let editPin = $state('');
	let editAdmin = $state(false);
	let deleting = $state(false);

	let bindCode = $state('');
	let bindWaiter = $state(true);
	let bindKitchen = $state(false);

	const selected = $derived(staff.find((s) => s.id === openId) ?? null);
	const selectedDevices = $derived(devices.filter((d) => d.assigned_user_id === openId));

	onMount(() => {
		void load();
	});

	async function load() {
		const [staffRes, hallsRes] = await Promise.all([
			fetch('/api/admin/staff'),
			fetch('/api/admin/halls')
		]);
		if (!staffRes.ok) {
			error = 'Нет доступа';
			return;
		}
		const data = await staffRes.json();
		staff = data.staff ?? [];
		devices = (data.devices ?? []).map((d: Device) => ({
			...d,
			roles: d.roles?.length ? d.roles : d.role ? [d.role as UserRole] : []
		}));
		if (hallsRes.ok) {
			const hd = await hallsRes.json();
			halls = (hd.halls ?? []).filter((h: Hall) => h.is_active === 1);
		}
		if (openId && !staff.some((s) => s.id === openId)) openId = null;
	}

	function deviceRoles(d: Device): UserRole[] {
		return d.roles?.length ? d.roles : d.role ? [d.role as UserRole] : [];
	}

	function staffRoleLabels(s: Staff): string[] {
		const labels: string[] = [];
		const ds = devices.filter((d) => d.assigned_user_id === s.id);
		if (ds.some((d) => deviceRoles(d).includes('waiter'))) labels.push('официант');
		if (ds.some((d) => deviceRoles(d).includes('kitchen'))) labels.push('кухня');
		if (s.role === 'admin') labels.push('админ');
		return labels;
	}

	function openStaff(s: Staff) {
		openId = s.id;
		editName = s.name;
		editPin = '';
		editAdmin = s.is_superadmin === 1 || s.role === 'admin';
		bindCode = '';
		bindWaiter = true;
		bindKitchen = false;
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
		if (newAdmin && !newPin.trim()) {
			error = 'Задай пароль админки';
			return;
		}
		if (newAdmin && /^0+$/.test(newPin.trim())) {
			error = 'Пароль не может быть из одних нулей';
			return;
		}
		const res = await fetch('/api/admin/staff', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: newName.trim(), pin: newAdmin ? newPin : '' })
		});
		const data = await res.json();
		if (!res.ok) {
			error = data.error ?? 'Ошибка создания';
			return;
		}
		newName = '';
		newPin = '';
		newAdmin = false;
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
		const payload: { name: string; pin?: string; admin?: boolean } = { name: editName.trim() };
		if (selected.is_superadmin !== 1) {
			payload.admin = editAdmin;
			if (editAdmin) {
				if (editPin && /^0+$/.test(editPin.trim())) {
					error = 'Пароль не может быть из одних нулей';
					return;
				}
				if (editPin) payload.pin = editPin;
				else if (!selected.has_pin) {
					error = 'Задай пароль админки';
					return;
				}
			}
		}
		const res = await fetch(`/api/admin/staff/${selected.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await res.json();
		if (!res.ok) {
			error = data.error ?? 'Ошибка сохранения';
			return;
		}
		editPin = '';
		message = 'Сохранено';
		await load();
	}

	async function setStaffBlocked(next: boolean) {
		if (!selected) return;
		error = null;
		const res = await fetch(
			`/api/admin/staff/${selected.id}/${next ? 'block' : 'unblock'}`,
			{ method: 'POST' }
		);
		if (!res.ok) {
			error = next ? 'Не удалось заблокировать' : 'Не удалось разблокировать';
			return;
		}
		message = next ? 'Сотрудник заблокирован' : 'Сотрудник разблокирован';
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
		await load();
	}

	async function setDeviceRoles(device: Device, next: UserRole[]) {
		if (!next.length) {
			error = 'Выбери хотя бы одну роль: официант или кухня';
			return;
		}
		error = null;
		const res = await fetch(`/api/admin/devices/${device.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ roles: next })
		});
		if (!res.ok) {
			error = 'Не удалось сменить роли';
			return;
		}
		await load();
	}

	function toggleDeviceRole(device: Device, role: UserRole, on: boolean) {
		const current = deviceRoles(device);
		const next = on ? [...new Set([...current, role])] : current.filter((r) => r !== role);
		void setDeviceRoles(device, next as UserRole[]);
	}

	async function toggleDeviceHall(device: Device, hallId: number, checked: boolean) {
		const next = checked
			? [...device.hall_ids, hallId]
			: device.hall_ids.filter((id) => id !== hallId);
		device.hall_ids = next;
		error = null;
		const res = await fetch(`/api/admin/devices/${device.id}/halls`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hallIds: next })
		});
		if (!res.ok) {
			error = 'Не удалось сохранить залы';
			await load();
		}
	}

	async function bind() {
		error = null;
		if (!openId || !bindCode.trim()) {
			error = 'Введи код устройства';
			return;
		}
		const roles: UserRole[] = [];
		if (bindWaiter) roles.push('waiter');
		if (bindKitchen) roles.push('kitchen');
		if (!roles.length) {
			error = 'Выбери хотя бы одну роль: официант или кухня';
			return;
		}
		const res = await fetch('/api/admin/devices/bind', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: bindCode.trim(), userId: openId, roles })
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

	function datetimeLabel(dbTime: string | null | undefined): string {
		if (!dbTime) return '—';
		const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dbTime);
		if (!m) return dbTime;
		return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}`;
	}

	function maskDeviceCode(value: string): string {
		const digits = value.replace(/\D/g, '').slice(0, 6);
		return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
	}
</script>

<header class="bg-slate-50 px-4 py-3 text-sm font-semibold">Персонал и устройства</header>

<div class="space-y-3 px-4 py-4">
	<button
		type="button"
		onclick={() => {
			createOpen = !createOpen;
			error = null;
		}}
		class="h-10 w-full rounded-md bg-emerald-600 text-sm font-semibold text-white"
	>
		{createOpen ? 'Закрыть форму' : '+ Добавить сотрудника'}
	</button>

	{#if createOpen}
		<form
			class="space-y-2 rounded-md border border-slate-200 bg-white p-3"
			onsubmit={(e) => {
				e.preventDefault();
				void createStaff();
			}}
		>
			<label class="block text-sm text-slate-700">
				Имя
				<input bind:value={newName} class="mt-1 h-10 w-full rounded-md bg-slate-100 px-3" placeholder="Имя сотрудника" />
			</label>
			<div class="flex gap-2">
				<AdminSwitch label="Админ" checked={newAdmin} onchange={(next) => (newAdmin = next)} />
			</div>
			{#if newAdmin}
				<label class="block text-sm text-slate-700">
					Пароль админки
					<input
						bind:value={newPin}
						type="password"
						inputmode="numeric"
						maxlength="8"
						autocomplete="new-password"
						class="mt-1 h-10 w-full rounded-md bg-slate-100 px-3"
						placeholder="4–8 цифр"
					/>
				</label>
				<p class="text-xs text-amber-700">{PIN_WARNING}</p>
			{/if}
			<button class="h-10 w-full rounded-md bg-emerald-600 text-sm font-semibold text-white">Создать</button>
		</form>
	{/if}

	{#if error && !selected}
		<p class="text-sm text-rose-600">{error}</p>
	{/if}
	{#if message && !selected}
		<p class="text-sm text-emerald-600">{message}</p>
	{/if}

	<h2 class="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Сотрудники</h2>
	<ul class="space-y-1.5">
		{#each staff as s}
			<li>
				<button
					type="button"
					onclick={() => openStaff(s)}
					class="flex h-10 w-full items-center justify-between rounded-md px-3 text-left bg-white text-slate-700"
				>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold">
							{s.name}
							{#if s.is_superadmin}
								<span class="ml-1 text-xs opacity-70">(владелец)</span>
							{/if}
							{#if s.is_blocked === 1}
								<span class="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-700">заблокирован</span>
							{/if}
							{#if s.is_active !== 1}
								<span class="ml-1 rounded bg-rose-100 px-1 text-xs text-rose-700">удалён</span>
							{/if}
						</p>
						<p class="text-xs text-slate-500">
							{staffRoleLabels(s).join(' · ') || 'нет ролей'}
						</p>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs text-slate-500">{devices.filter((d) => d.assigned_user_id === s.id).length} устр.</span>
						<span class="text-base text-slate-400">›</span>
					</div>
				</button>
			</li>
		{/each}
	</ul>
</div>

{#if selected}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center print:hidden">
		<div class="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-lg bg-slate-100 p-3">
			<div class="flex items-center justify-between">
				<p class="text-base font-bold">{selected.name}</p>
				<button type="button" onclick={close} class="flex h-8 w-8 items-center justify-center rounded-md bg-white text-sm text-slate-500" aria-label="Закрыть">
					✕
				</button>
			</div>

			{#if error}
				<p class="mt-2 text-sm text-rose-600">{error}</p>
			{/if}
			{#if message}
				<p class="mt-2 text-sm text-emerald-600">{message}</p>
			{/if}

			<label class="mt-2 block text-sm text-slate-700">
				Имя
				<input bind:value={editName} class="mt-1 h-10 w-full rounded-md bg-white px-3" />
			</label>

			<div class="mt-2 flex gap-2">
				<AdminSwitch
					label="Админ"
					checked={editAdmin}
					disabled={selected.is_superadmin === 1}
					onchange={(next) => (editAdmin = next)}
				/>
			</div>

			{#if selected.is_superadmin !== 1 && editAdmin}
				<label class="mt-2 block text-sm text-slate-700">
					Пароль админки
					<input
						bind:value={editPin}
						type="password"
						inputmode="numeric"
						maxlength="8"
						autocomplete="new-password"
						class="mt-1 h-10 w-full rounded-md bg-white px-3"
						placeholder={selected.has_pin ? 'задан · введи новый, чтобы сменить' : '4–8 цифр'}
					/>
				</label>
				<p class="mt-1 text-xs text-amber-700">{PIN_WARNING}</p>
			{/if}

			{#if selected.is_active === 1}
				<div class="mt-2 border-t border-slate-200 pt-2">
					<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Устройства</p>
					<ul class="mt-1.5 space-y-1.5">
						{#each selectedDevices as d}
							<li class="rounded-md bg-white p-2">
								<div class="flex items-center gap-2">
									<span class="font-mono text-sm font-semibold">{d.device_code}</span>
									<span class="ml-auto text-xs text-slate-500">{d.status === 'active' ? 'работает' : 'заблок.'}</span>
									<button
										type="button"
										role="switch"
										aria-checked={d.status === 'active'}
										aria-label={d.status === 'active' ? 'Заблокировать устройство' : 'Разблокировать устройство'}
										onclick={() => setDeviceStatus(d, d.status === 'active' ? 'suspended' : 'active')}
										class="relative h-5 w-9 shrink-0 rounded-full transition-colors {d.status === 'active'
											? 'bg-emerald-500'
											: 'bg-slate-300'}"
									>
										<span
											class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {d.status === 'active'
												? 'translate-x-4'
												: ''}"
										></span>
									</button>
								</div>
								<div class="mt-1.5 flex gap-2">
									<AdminSwitch
										label="Официант"
										checked={deviceRoles(d).includes('waiter')}
										onchange={(on) => toggleDeviceRole(d, 'waiter', on)}
									/>
									<AdminSwitch
										label="Кухня"
										checked={deviceRoles(d).includes('kitchen')}
										onchange={(on) => toggleDeviceRole(d, 'kitchen', on)}
									/>
								</div>
								<p class="mt-1 text-xs text-slate-500">Заблокировано: {datetimeLabel(d.blocked_at)}</p>
								<div class="mt-1.5 border-t border-slate-100 pt-1.5">
									<p class="text-xs text-slate-500">Залы</p>
									<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1">
										{#each halls as hall}
											<label class="flex items-center gap-1.5 text-sm text-slate-700">
												<input
													type="checkbox"
													checked={d.hall_ids.includes(hall.id)}
													onchange={(e) =>
														toggleDeviceHall(d, hall.id, (e.currentTarget as HTMLInputElement).checked)}
												/>
												{hall.name}
											</label>
										{/each}
										{#if halls.length === 0}
											<span class="text-xs text-slate-400">Нет активных залов</span>
										{/if}
									</div>
								</div>
							</li>
						{:else}
							<li class="text-sm text-slate-500">Нет привязанных устройств</li>
						{/each}
					</ul>

					<form
						class="mt-1.5 space-y-1.5 rounded-md bg-white p-2"
						onsubmit={(e) => {
							e.preventDefault();
							void bind();
						}}
					>
						<div class="flex items-center gap-2">
							<input
								value={bindCode}
								oninput={(e) => (bindCode = maskDeviceCode((e.currentTarget as HTMLInputElement).value))}
								inputmode="numeric"
								autocomplete="off"
								class="h-10 min-w-0 flex-1 rounded-md bg-slate-100 px-3 font-mono text-sm tracking-widest"
								placeholder="•••-•••"
							/>
							<button
								type="submit"
								disabled={!bindCode.trim()}
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white disabled:opacity-40"
								aria-label="Привязать"
							>
								<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5">
									<path d="M12 5v14M5 12h14" />
								</svg>
							</button>
						</div>
						<div class="flex gap-2">
							<AdminSwitch label="Официант" checked={bindWaiter} onchange={(next) => (bindWaiter = next)} />
							<AdminSwitch label="Кухня" checked={bindKitchen} onchange={(next) => (bindKitchen = next)} />
						</div>
					</form>
				</div>
			{/if}

			<div class="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
				<button type="button" class="h-10 rounded-md bg-white text-sm" onclick={close}>Отмена</button>
				<button class="h-10 rounded-md bg-slate-800 text-sm font-semibold text-white" onclick={() => saveStaff()}>
					Сохранить
				</button>
			</div>

			{#if selected.is_superadmin !== 1}
				<div class="mt-2">
					<AdminSwitch
						label="Заблокирован"
						checked={selected.is_blocked === 1}
						onchange={(next) => void setStaffBlocked(next)}
					/>
				</div>
				{#if selected.is_active === 1}
					<button
						type="button"
						onclick={() => removeStaff()}
						disabled={deleting}
						class="mt-2 h-10 w-full rounded-md bg-rose-100 text-sm font-semibold text-rose-700 disabled:opacity-50"
					>
						Удалить
					</button>
				{:else}
					<button
						type="button"
						onclick={() => restoreStaff()}
						class="mt-2 h-10 w-full rounded-md bg-emerald-100 text-sm font-semibold text-emerald-700"
					>
						Восстановить
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}
