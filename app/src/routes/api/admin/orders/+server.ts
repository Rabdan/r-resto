import { json, type RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { getOpenShiftId } from '$lib/server/expenses';
import { loadOrdersForShift } from '$lib/server/shifts';

export const GET: RequestHandler = async ({ locals, url }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const hallId = Number(url.searchParams.get('hallId') || 0);
	if (!hallId) return json({ open: [], closed: [], cancelled: [] });

	const shiftId = getOpenShiftId(db, locationId, hallId);
	if (!shiftId) return json({ open: [], closed: [], cancelled: [] });

	const { open, closed_checks, cancelled } = loadOrdersForShift(db, locationId, shiftId);
	return json({ open, closed: closed_checks, cancelled });
};
