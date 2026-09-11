import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const locationId = locals.admin!.locationId;
	const userId = locals.admin!.id;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const open = db
		.prepare(`SELECT id FROM shifts WHERE location_id = ? AND status = 'open'`)
		.get(locationId);
	if (open) return json({ error: 'already_open' }, { status: 409 });

	const info = db
		.prepare(
			`INSERT INTO shifts (location_id, opened_by_user_id, status) VALUES (?, ?, 'open')`
		)
		.run(locationId, userId);

	broadcast('SHIFT_OPENED', { shiftId: Number(info.lastInsertRowid), locationId });
	return json({ id: Number(info.lastInsertRowid) }, { status: 201 });
};
