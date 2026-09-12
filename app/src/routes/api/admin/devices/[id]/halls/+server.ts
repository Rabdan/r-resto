import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const deviceId = Number(params.id);
	const device = db
		.prepare(`SELECT id, location_id FROM devices WHERE id = ?`)
		.get(deviceId) as { id: number; location_id: number | null } | undefined;
	if (!device) return json({ error: 'not_found' }, { status: 404 });

	const body = (await request.json().catch(() => ({}))) as { hallIds?: number[] };
	const hallIds = Array.isArray(body.hallIds)
		? body.hallIds.map(Number).filter((n) => Number.isFinite(n))
		: [];

	const locationId = device.location_id;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	db.transaction(() => {
		db.prepare(`DELETE FROM device_halls WHERE device_id = ?`).run(deviceId);
		const ins = db.prepare(`INSERT INTO device_halls (device_id, hall_id) VALUES (?, ?)`);
		for (const hallId of hallIds) {
			const hall = db
				.prepare(`SELECT id FROM halls WHERE id = ? AND location_id = ?`)
				.get(hallId, locationId);
			if (hall) ins.run(deviceId, hallId);
		}
	})();

	return json({ ok: true });
};
