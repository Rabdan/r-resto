import { DEFAULT_CURRENCY } from '$lib/currency';
import { DEFAULT_TIMEZONE } from '$lib/timezone';

export const ssr = false;
export const prerender = false;

export async function load() {
	try {
		const res = await fetch('/api/settings');
		if (res.ok) {
			const data = (await res.json()) as { currency?: string; timezone?: string };
			return {
				currency: data.currency ?? DEFAULT_CURRENCY,
				timezone: data.timezone ?? DEFAULT_TIMEZONE
			};
		}
	} catch {
		/* keep defaults */
	}
	return { currency: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE };
}
