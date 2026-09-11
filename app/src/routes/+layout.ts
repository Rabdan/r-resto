import { setCurrency } from '$lib/money';

export const ssr = false;
export const prerender = false;

export async function load() {
	try {
		const res = await fetch('/api/settings');
		if (res.ok) {
			const data = (await res.json()) as { currency?: string };
			if (data.currency) setCurrency(data.currency);
		}
	} catch {
		/* keep default currency */
	}
}
