import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import { closeOpenShift } from '$lib/server/shifts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const result = closeOpenShift(db, locationId, locals.admin!.id);
	if ('error' in result) {
		if (result.error === 'open_prechecks') {
			return json({ error: 'Сначала закрой или отмени незакрытые чеки' }, { status: 409 });
		}
		return json({ error: 'Смена не открыта' }, { status: 409 });
	}

	broadcast('SHIFT_CLOSED', { shiftId: result.shiftId, locationId });
	return json({ ok: true, shiftId: result.shiftId, z: result.z });
};
