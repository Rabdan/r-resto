import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { listShifts } from '$lib/server/shifts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const halls = db
		.prepare(
			`SELECT id, name FROM halls WHERE location_id = ? AND is_active = 1 ORDER BY sort_order, id`
		)
		.all(locationId) as Array<{ id: number; name: string }>;

	return json({ halls, shifts: listShifts(db, locationId) });
};
