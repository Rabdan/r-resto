<script lang="ts">
	import { page } from '$app/state';

	const items = [
		{ href: '/admin/devices', label: 'Персонал' },
		{ href: '/admin/menu', label: 'Меню' },
		{ href: '/admin/shift', label: 'Смена' },
		{ href: '/admin/analytics', label: 'Отчёты' },
		{ href: '/admin/settings', label: 'Настройки' }
	];
</script>

<nav
	class="fixed bottom-0 left-0 right-0 z-20 grid h-[60px] grid-cols-5 border-t border-slate-200 bg-slate-100"
>
	{#each items as item}
		<a
			href={item.href}
			class="flex min-h-12 items-center justify-center px-1 text-center text-[11px] font-medium {page.url.pathname.startsWith(
				item.href
			)
				? 'text-emerald-600'
				: 'text-slate-500'}"
		>
			{item.label}
		</a>
	{/each}
</nav>
