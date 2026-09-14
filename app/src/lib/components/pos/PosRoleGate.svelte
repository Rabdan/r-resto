<script lang="ts">
	import { onMount, setContext } from 'svelte';
	import {
		POS_SESSION_KEY,
		posSession,
		startPosSession,
		stopPosSession
	} from '$lib/client/pos-session.svelte';
	import type { UserRole } from '$lib/types';

	let { role, children }: { role: UserRole; children: import('svelte').Snippet } = $props();

	setContext(POS_SESSION_KEY, posSession);

	onMount(() => {
		document.documentElement.classList.add('pos-shell');
		if (role === 'waiter' || role === 'kitchen') document.documentElement.classList.add('pos-shell-light');
		void startPosSession(role);
		return () => {
			document.documentElement.classList.remove('pos-shell', 'pos-shell-light');
			stopPosSession();
		};
	});

	const light = $derived(role === 'waiter' || role === 'kitchen');
</script>

<div class="h-dvh overflow-hidden {light ? 'bg-slate-50 text-slate-900' : 'bg-slate-900 text-slate-100'}">
	{#if posSession.status === 'ready'}
		{@render children()}
	{:else}
		<p class="flex h-full items-center justify-center {light ? 'text-slate-500' : 'text-slate-400'}">
			Подключение…
		</p>
	{/if}
</div>
