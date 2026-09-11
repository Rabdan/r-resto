<script lang="ts">
	import { page } from '$app/state';
	import AdminNav from '$lib/components/AdminNav.svelte';

	let { children } = $props();

	type AuthState = 'checking' | 'allowed' | 'denied';

	const isLogin = $derived(page.url.pathname === '/admin');
	let authState: AuthState = $state('checking');
	let adminName = $state('');

	$effect(() => {
		const path = page.url.pathname;
		if (path === '/admin') {
			authState = 'checking';
			return;
		}

		let cancelled = false;
		authState = 'checking';
		void fetch('/api/admin/me').then(async (res) => {
			if (cancelled) return;
			if (!res.ok) {
				authState = 'denied';
				return;
			}
			const data = await res.json();
			adminName = data.admin?.name ?? '';
			authState = 'allowed';
		});

		return () => {
			cancelled = true;
		};
	});

	async function logout() {
		await fetch('/api/admin/logout', { method: 'POST' });
		window.location.href = '/admin';
	}
</script>

{#if isLogin}
	{@render children()}
{:else if authState === 'allowed'}
	<div class="min-h-dvh pb-[60px]">
		<div class="flex items-center justify-between bg-slate-50 px-4 py-2">
			<p class="text-sm text-slate-700">{adminName}</p>
			<button type="button" onclick={logout} class="h-10 px-3 text-sm text-rose-600">Выход</button>
		</div>
		{@render children()}
		<AdminNav />
	</div>
{:else if authState === 'denied'}
	<div class="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
		<p class="text-slate-600">Сессия истекла или нет доступа</p>
		<button
			type="button"
			onclick={() => (window.location.href = '/admin')}
			class="h-12 rounded-md bg-emerald-600 px-6 font-semibold text-white"
		>
			Войти
		</button>
	</div>
{:else}
	<div class="flex min-h-dvh items-center justify-center text-slate-500">Проверка сессии…</div>
{/if}
