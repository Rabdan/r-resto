<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { POS_SESSION_KEY, type PosSessionState } from '$lib/client/pos-session.svelte';
	import { posRolesOf } from '$lib/types';

	let {
		title,
		hallColor = '#065F46',
		halls = [],
		hallId = null,
		allowAllHalls = false,
		largeTargets = false,
		onHallChange = () => {},
		children
	} = $props<{
		title: string;
		hallColor?: string;
		halls?: Array<{ id: number; name: string }>;
		hallId?: number | null;
		allowAllHalls?: boolean;
		largeTargets?: boolean;
		onHallChange?: (id: number | null) => void;
		children: import('svelte').Snippet;
	}>();

	const session = getContext<PosSessionState>(POS_SESSION_KEY);
	const showHome = $derived(posRolesOf(session?.device).length > 1);
	const deviceCode = $derived(session?.device?.deviceCode ?? '');
	const showHalls = $derived(allowAllHalls ? halls.length >= 1 : halls.length > 1);
	const chrome = $derived(largeTargets ? 'h-14' : 'h-12');
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900">
	<header class="shrink-0 px-4 py-3 text-white" style="background-color: {hallColor}">
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0 flex-1">
				{#if deviceCode}
					<p class="font-mono text-[11px] leading-none tracking-widest text-white/80">{deviceCode}</p>
				{/if}
				<p class="truncate text-lg font-semibold {deviceCode ? 'mt-1' : ''}">{title}</p>
			</div>
			{#if showHalls}
				<select
					class="{chrome} max-w-[40%] shrink-0 rounded-md border border-white/30 bg-black/25 px-3 text-sm font-semibold text-white outline-none"
					value={hallId ?? ''}
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						onHallChange(v === '' ? null : Number(v));
					}}
				>
					{#if allowAllHalls}
						<option value="" class="text-slate-900">Все</option>
					{/if}
					{#each halls as hall}
						<option value={hall.id} class="text-slate-900">{hall.name}</option>
					{/each}
				</select>
			{/if}
			{#if showHome}
				<button
					type="button"
					onclick={() => void goto('/')}
					class="flex {chrome} w-12 shrink-0 items-center justify-center rounded-md border border-white/30 bg-black/20"
					aria-label="Выбор роли"
				>
					<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
					</svg>
				</button>
			{/if}
		</div>
	</header>
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		{@render children()}
	</div>
</div>
