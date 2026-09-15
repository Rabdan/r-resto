<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { setCurrency } from '$lib/money';
	import { setTimezone } from '$lib/timezone';

	let { children, data } = $props();

	$effect(() => {
		if (data.currency) setCurrency(data.currency);
		if (data.timezone) setTimezone(data.timezone);
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		const admin = page.url.pathname.startsWith('/admin');
		document.querySelector('link[rel="manifest"]')?.setAttribute(
			'href',
			admin ? '/admin.webmanifest' : '/manifest.webmanifest'
		);
		document
			.querySelector('meta[name="apple-mobile-web-app-title"]')
			?.setAttribute('content', admin ? 'Админ' : 'R-resto');
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', admin ? '#059669' : '#ff6a3d');
	});
</script>

<div class="min-h-dvh">
	{@render children()}
</div>
