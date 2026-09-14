import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { deviceHasRole } from '$lib/types';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (locals.device?.status !== 'active' || !deviceHasRole(locals.device, 'kitchen')) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const locationId = locals.device.locationId;
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const itemId = Number(params.id);
	const body = (await request.json().catch(() => ({}))) as { status?: string };
	const next = body.status;
	if (next !== 'ready' && next !== 'pending') {
		return json({ error: 'invalid_status' }, { status: 400 });
	}

	const row = db
		.prepare(
			`SELECT i.id, i.status, i.order_id, o.status AS order_status, o.hall_id
			 FROM order_items i
			 JOIN orders o ON o.id = i.order_id
			 WHERE i.id = ? AND o.location_id = ?`
		)
		.get(itemId, locationId) as
		| { id: number; status: string; order_id: number; order_status: string; hall_id: number }
		| undefined;
	if (!row) return json({ error: 'not_found' }, { status: 404 });
	if (row.order_status !== 'open') return json({ error: 'not_open' }, { status: 409 });
	if (row.status !== 'pending' && row.status !== 'ready') {
		return json({ error: 'not_kitchen_item' }, { status: 409 });
	}

	const deviceId = locals.device.id;
	const allowed = db
		.prepare(
			`SELECT 1 AS ok
			 FROM halls h
			 WHERE h.id = ?
			   AND (
			     EXISTS (SELECT 1 FROM device_halls dh WHERE dh.device_id = ? AND dh.hall_id = h.id)
			     OR NOT EXISTS (SELECT 1 FROM device_halls dh2 WHERE dh2.device_id = ?)
			   )`
		)
		.get(row.hall_id, deviceId, deviceId) as { ok: number } | undefined;
	if (!allowed) return json({ error: 'forbidden' }, { status: 403 });

	if (next === 'ready') {
		db.prepare(
			`UPDATE order_items SET status = 'ready', ready_at = datetime('now') WHERE id = ?`
		).run(itemId);
	} else {
		db.prepare(`UPDATE order_items SET status = 'pending', ready_at = NULL WHERE id = ?`).run(itemId);
	}

	const updated = db
		.prepare(`SELECT status, ready_at FROM order_items WHERE id = ?`)
		.get(itemId) as { status: string; ready_at: string | null };

	broadcast('ITEM_STATUS_CHANGED', {
		orderId: row.order_id,
		itemId,
		status: updated.status,
		ready_at: updated.ready_at,
		locationId
	});

	return json({ ok: true, itemId, status: updated.status, ready_at: updated.ready_at });
};
