import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { CURRENCIES, DEFAULT_CURRENCY } from '$lib/currency';
import { isValidTimezone } from '$lib/timezone';
import { timezoneOf } from '$lib/server/timezone';
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
	const locationId = locationIdOf(locals);
	return json({ currency: currencyOf(locationId), timezone: timezoneOf(locationId) });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as { currency?: string; timezone?: string };

	let currency = currencyOf(locationId);
	let timezone = timezoneOf(locationId);

	if (body.currency !== undefined) {
		if (!body.currency || !CURRENCIES[body.currency]) {
			return json({ error: 'invalid_currency' }, { status: 400 });
		}
		currency = body.currency;
		db.prepare(`UPDATE locations SET currency = ? WHERE id = ?`).run(currency, locationId);
	}

	if (body.timezone !== undefined) {
		if (!isValidTimezone(body.timezone)) {
			return json({ error: 'invalid_timezone' }, { status: 400 });
		}
		timezone = body.timezone;
		db.prepare(`UPDATE locations SET timezone = ? WHERE id = ?`).run(timezone, locationId);
	}

	return json({ currency, timezone });
};
