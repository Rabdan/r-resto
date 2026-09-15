import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { isIsoDate } from '$lib/period';
import { timezoneOf } from '$lib/server/timezone';
import { compareProducts } from '$lib/server/reports';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	if (!isIsoDate(from) || !isIsoDate(to)) {
		return json({ error: 'invalid_range' }, { status: 400 });
	}

	try {
		const result = compareProducts(db, locationId, from, to, timezoneOf(locationId));
		return json({ from, to, ...result });
	} catch {
		return json({ error: 'invalid_range' }, { status: 400 });
	}
};
