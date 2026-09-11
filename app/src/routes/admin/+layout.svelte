<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AdminNav from '$lib/components/AdminNav.svelte';

	let { children } = $props();

	const isLogin = $derived(page.url.pathname === '/admin');
	let allowed = $state(false);
	let adminName = $state('');

	$effect(() => {
		const path = page.url.pathname;
		if (path === '/admin') {
			allowed = false;
			return;
		}

		let cancelled = false;
		allowed = false;
		void fetch('/api/admin/me').then(async (res) => {
			if (cancelled) return;
			if (!res.ok) {
				await goto('/admin');
				return;
			}
			const data = await res.json();
			adminName = data.admin?.name ?? '';
			allowed = true;
		});

		return () => {
			cancelled = true;
		};
	});

	async function logout() {
		await fetch('/api/admin/logout', { method: 'POST' });
		await goto('/admin');
	}
</script>

{#if isLogin}
	{@render children()}
{:else if allowed}
	<div class="min-h-dvh pb-[60px]">
		<div class="flex items-center justify-between bg-slate-50 px-4 py-2">
			<p class="text-sm text-slate-700">{adminName}</p>
			<button type="button" onclick={logout} class="h-10 px-3 text-sm text-rose-600">Выход</button>
		</div>
		{@render children()}
		<AdminNav />
	</div>
{/if}
