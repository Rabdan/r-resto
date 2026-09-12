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
		void startPosSession(role);
		return () => {
			document.documentElement.classList.remove('pos-shell');
			stopPosSession();
		};
	});
</script>

<div class="min-h-dvh bg-slate-900 text-slate-100">
	{#if posSession.status === 'ready'}
		{@render children()}
	{:else}
		<p class="flex min-h-dvh items-center justify-center text-slate-400">Подключение…</p>
	{/if}
</div>
