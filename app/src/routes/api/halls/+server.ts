import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const device = locals.device;
	const locationId = locals.admin?.locationId ?? (device?.status === 'active' ? device.locationId : null);
	if (!locationId) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	let halls: unknown[];
	if (device?.id) {
		halls = db
			.prepare(
				`SELECT h.id, h.name, h.color_hex, h.sort_order
				 FROM halls h
				 WHERE h.location_id = ?
				   AND h.is_active = 1
				   AND (
				     EXISTS (SELECT 1 FROM device_halls dh WHERE dh.device_id = ? AND dh.hall_id = h.id)
				     OR NOT EXISTS (SELECT 1 FROM device_halls dh2 WHERE dh2.device_id = ?)
				   )
				 ORDER BY h.sort_order, h.id`
			)
			.all(locationId, device.id, device.id);
	} else {
		halls = db
			.prepare(
				`SELECT id, name, color_hex, sort_order
				 FROM halls
				 WHERE location_id = ? AND is_active = 1
				 ORDER BY sort_order, id`
			)
			.all(locationId);
	}

	return json({ halls });
};
