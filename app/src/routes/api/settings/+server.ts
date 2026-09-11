import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { CURRENCIES, DEFAULT_CURRENCY } from '$lib/currency';
import type { RequestHandler } from './$types';

function locationIdOf(locals: App.Locals): number | null {
	return locals.admin?.locationId ?? (locals.device?.status === 'active' ? locals.device.locationId : null);
}

function currencyOf(locationId: number | null): string {
	if (!locationId) return DEFAULT_CURRENCY;
	const row = db.prepare(`SELECT currency FROM locations WHERE id = ?`).get(locationId) as
		| { currency: string }
		| undefined;
	return row?.currency ?? DEFAULT_CURRENCY;
}

export const GET: RequestHandler = async ({ locals }) => {
	return json({ currency: currencyOf(locationIdOf(locals)) });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as { currency?: string };
	const currency = body.currency;
	if (!currency || !CURRENCIES[currency]) {
		return json({ error: 'invalid_currency' }, { status: 400 });
	}

	db.prepare(`UPDATE locations SET currency = ? WHERE id = ?`).run(currency, locationId);
	return json({ currency });
};
