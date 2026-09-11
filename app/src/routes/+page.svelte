<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { roleHome, type DeviceSession } from '$lib/types';
	import logo from '$lib/assets/logo.svg';

	let device = $state<DeviceSession | null>(null);
	let error = $state<string | null>(null);
	let source: EventSource | undefined;

	async function refresh() {
		const res = await fetch('/api/devices/register', { method: 'POST' });
		if (!res.ok) {
			error = 'Не удалось зарегистрировать устройство';
			return;
		}
		const data = (await res.json()) as { device: DeviceSession | null };
		device = data.device;
		if (device?.status === 'active' && (device.role === 'waiter' || device.role === 'kitchen')) {
			await goto(roleHome(device.role));
		}
	}

	function connectEvents() {
		source = new EventSource('/api/events');
		source.addEventListener('DEVICE_ACTIVATED', () => {
			void refresh();
		});
		source.addEventListener('DEVICE_BLOCKED', () => {
			device = null;
			void goto('/');
		});
		source.onerror = () => {
			source?.close();
			setTimeout(connectEvents, 3000);
		};
	}

	onMount(() => {
		void refresh();
		connectEvents();
		return () => source?.close();
	});
</script>

<main class="flex min-h-dvh flex-col items-center justify-center px-6">
	<div class="w-full max-w-sm rounded-md border border-slate-200 bg-white/80 p-6 text-center shadow-xl">
		<img src={logo} alt="R-resto" class="mx-auto mb-4 h-16" />
		<p class="text-sm uppercase tracking-[0.2em] text-slate-500">Привязка терминала</p>
		{#if error}
			<p class="mt-4 text-rose-600">{error}</p>
		{:else if device && device.status !== 'active'}
			<p class="mt-6 font-mono text-5xl font-semibold tracking-[0.18em] text-emerald-600">
				{device.deviceCode}
			</p>
			<p class="mt-4 text-slate-700">Покажи этот код администратору</p>
			<p class="mt-6 inline-flex items-center gap-2 text-sm text-slate-500">
				<span class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
				Ожидание подтверждения
			</p>
		{:else}
			<p class="mt-6 text-slate-500">Подключение…</p>
		{/if}
		<a href="/admin" class="mt-8 block text-sm text-slate-500">Вход администратора</a>
	</div>
</main>
