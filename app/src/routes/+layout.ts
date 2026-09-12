import { DEFAULT_CURRENCY } from '$lib/currency';

export const ssr = false;
export const prerender = false;

export async function load() {
	try {
		const res = await fetch('/api/settings');
		if (res.ok) {
			const data = (await res.json()) as { currency?: string };
			if (data.currency) return { currency: data.currency };
		}
	} catch {
		/* keep default currency */
	}
	return { currency: DEFAULT_CURRENCY };
}
