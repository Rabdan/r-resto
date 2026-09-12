import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { getOpenShiftId } from '$lib/server/expenses';
import { loadPrechecksForShift } from '$lib/server/shifts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const shiftId = getOpenShiftId(db, locationId);
	if (!shiftId) return json({ open: [], closed: [], cancelled: [] });

	const { open, closed_prechecks, cancelled } = loadPrechecksForShift(db, locationId, shiftId);
	return json({ open, closed: closed_prechecks, cancelled });
};
