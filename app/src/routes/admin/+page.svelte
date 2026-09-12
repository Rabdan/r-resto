<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PinPad from '$lib/components/PinPad.svelte';
	import logo from '$lib/assets/logo.svg';

	let pin = $state('');
	let error = $state<string | null>(null);
	let loading = $state(false);

	onMount(async () => {
		const me = await fetch('/api/admin/me');
		if (me.ok) {
			await goto('/admin/devices');
		}
	});

	async function submit() {
		error = null;
		if (pin.length < 4) {
			error = 'Введи цифровой пароль';
			return;
		}
		loading = true;
		const res = await fetch('/api/admin/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ pin })
		});
		loading = false;
		if (!res.ok) {
			pin = '';
			error = 'Неверный пароль';
			return;
		}
		await goto('/admin/devices');
	}
</script>

<main class="flex min-h-dvh flex-col items-center justify-center px-6 pb-8">
	<div class="w-full max-w-sm">
		<img src={logo} alt="R-resto" class="mx-auto mb-4 h-16" />
		<p class="text-center text-sm uppercase tracking-[0.2em] text-slate-500">Админ</p>
		<h1 class="mt-2 text-center text-2xl font-semibold">Вход по PIN-коду</h1>

		<div class="mt-6 flex justify-center gap-2">
			{#each Array.from({ length: Math.max(4, pin.length) }) as _dot, i}
				<span
					class="h-3 w-3 rounded-full {i < pin.length ? 'bg-emerald-500' : 'bg-slate-300'}"
				></span>
			{/each}
		</div>

		<div class="mt-6">
			<PinPad bind:value={pin} />
		</div>

		<button
			type="button"
			onclick={submit}
			disabled={loading}
			class="mt-4 h-14 w-full rounded-md bg-emerald-600 text-white text-lg font-semibold disabled:opacity-50"
		>
			Войти
		</button>
		{#if error}
			<p class="mt-3 text-center text-sm text-rose-600">{error}</p>
		{/if}
		<a href="/" class="mt-6 block text-center text-sm text-slate-500">К привязке терминала</a>
	</div>
</main>
