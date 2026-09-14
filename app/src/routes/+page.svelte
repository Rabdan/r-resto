<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { posRolesOf, roleHome, type DeviceSession } from '$lib/types';
	import logo from '$lib/assets/logo.svg';

	let device = $state<DeviceSession | null>(null);
	let error = $state<string | null>(null);
	let source: EventSource | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let running = false;

	const roles = $derived(posRolesOf(device));

	async function refresh() {
		let deviceCode = '';
		try {
			deviceCode = localStorage.getItem('r_resto_device_code') ?? '';
		} catch {
			/* ignore */
		}
		const res = await fetch('/api/devices/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ deviceCode })
		});
		if (!res.ok) {
			error = 'Не удалось зарегистрировать устройство';
			return;
		}
		const data = (await res.json()) as { device: DeviceSession | null };
		device = data.device;
		const nextRoles = posRolesOf(data.device);
		if (data.device?.status === 'active' && nextRoles.length === 1) {
			await goto(roleHome(nextRoles[0]));
		}
	}

	function connectEvents() {
		if (!running) return;
		if (reconnectTimer !== undefined) {
			clearTimeout(reconnectTimer);
			reconnectTimer = undefined;
		}
		source?.close();
		const es = new EventSource('/api/events');
		source = es;
		es.addEventListener('DEVICE_ACTIVATED', () => {
			if (source !== es) return;
			void refresh();
		});
		es.addEventListener('DEVICE_BLOCKED', () => {
			if (source !== es) return;
			device = null;
			void goto('/');
		});
		es.onerror = () => {
			if (source !== es) return;
			es.close();
			if (source === es) source = undefined;
			if (!running) return;
			reconnectTimer = setTimeout(connectEvents, 3000);
		};
	}

	onMount(() => {
		running = true;
		void refresh();
		connectEvents();
		return () => {
			running = false;
			if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
			source?.close();
			source = undefined;
		};
	});
</script>

<main class="flex min-h-dvh flex-col items-center justify-center px-6">
	<div class="w-full max-w-sm rounded-md border border-slate-200 bg-white/80 p-6 text-center shadow-xl">
		<img src={logo} alt="R-resto" class="mx-auto mb-4 h-16" />
		<p class="text-sm uppercase tracking-[0.2em] text-slate-500">Привязка терминала</p>
		{#if error}
			<p class="mt-4 text-rose-600">{error}</p>
		{:else if device && device.status !== 'active'}
			<p class="mt-6 font-mono text-4xl font-semibold tracking-[0.18em] text-emerald-600">
				{device.deviceCode}
			</p>
			<p class="mt-4 text-slate-700">Покажи этот код администратору</p>
			<p class="mt-6 inline-flex items-center gap-2 text-sm text-slate-500">
				<span class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
				Ожидание подтверждения
			</p>
		{:else if device?.status === 'active' && roles.length > 1}
			<p class="mt-4 text-slate-700">Выбери роль</p>
			<div class="mt-4 grid gap-2">
				{#if roles.includes('waiter')}
					<a
						href="/waiter"
						class="flex h-12 items-center justify-center rounded-md bg-emerald-600 text-base font-semibold text-white"
					>
						Официант
					</a>
				{/if}
				{#if roles.includes('kitchen')}
					<a
						href="/kitchen"
						class="flex h-12 items-center justify-center rounded-md bg-slate-800 text-base font-semibold text-white"
					>
						Кухня
					</a>
				{/if}
			</div>
		{:else}
			<p class="mt-6 text-slate-500">Подключение…</p>
		{/if}
	</div>
</main>
