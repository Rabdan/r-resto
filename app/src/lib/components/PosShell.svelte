<script lang="ts">
	let {
		title,
		hallColor = '#065F46',
		halls = [],
		hallId = null,
		onHallChange = () => {},
		children
	} = $props<{
		title: string;
		hallColor?: string;
		halls?: Array<{ id: number; name: string }>;
		hallId?: number | null;
		onHallChange?: (id: number) => void;
		children: import('svelte').Snippet;
	}>();
</script>

<div class="flex min-h-dvh flex-col">
	<header class="px-4 py-3 text-white" style="background-color: {hallColor}">
		<div class="flex items-center justify-between gap-3">
			<p class="min-w-0 flex-1 truncate text-lg font-semibold">{title}</p>
			{#if halls.length > 1}
				<select
					class="h-10 shrink-0 rounded-md border-0 bg-black/25 px-2 text-sm font-semibold text-white outline-none"
					onchange={(e) => onHallChange(Number((e.currentTarget as HTMLSelectElement).value))}
				>
					{#each halls as hall}
						<option value={hall.id} selected={hall.id === hallId} class="text-slate-900">{hall.name}</option>
					{/each}
				</select>
			{/if}
		</div>
	</header>
	<div class="flex-1 pb-20">
		{@render children()}
	</div>
</div>
