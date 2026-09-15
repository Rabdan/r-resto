import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import { openShiftForHall } from '$lib/server/shifts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const locationId = locals.admin!.locationId;
	const userId = locals.admin!.id;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as { hallId?: number };
	const hallId = Number(body.hallId);
	if (!hallId) return json({ error: 'hall_required' }, { status: 400 });

	const result = openShiftForHall(db, locationId, hallId, userId);
	if ('error' in result) {
		if (result.error === 'already_open') {
			return json({ error: 'already_open' }, { status: 409 });
		}
		return json({ error: 'hall_not_found' }, { status: 404 });
	}

	broadcast('SHIFT_OPENED', { shiftId: result.id, hallId, locationId });
	return json({ id: result.id, hallId }, { status: 201 });
};
