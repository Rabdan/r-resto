import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

const VALID_STATUSES = ['active', 'suspended', 'terminated'] as const;

export const PATCH: RequestHandler = async ({ request, locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const deviceId = Number(params.id);
	const device = db
		.prepare(`SELECT id, device_uuid, status, assigned_user_id FROM devices WHERE id = ?`)
		.get(deviceId) as
		| { id: number; device_uuid: string; status: string; assigned_user_id: number | null }
		| undefined;
	if (!device) return json({ error: 'not_found' }, { status: 404 });

	const body = (await request.json().catch(() => ({}))) as { status?: string };
	const status = body.status;
	if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
		return json({ error: 'invalid_status' }, { status: 400 });
	}
	if (status === 'active' && !device.assigned_user_id) {
		return json({ error: 'device_unassigned' }, { status: 400 });
	}

	if (status === 'active') {
		db.prepare(
			`UPDATE devices SET status = 'active', blocked_at = NULL, updated_at = datetime('now') WHERE id = ?`
		).run(deviceId);
	} else {
		db.prepare(
			`UPDATE devices SET status = ?, blocked_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
		).run(status, deviceId);
	}

	if (status === 'active') {
		broadcast('DEVICE_ACTIVATED', { deviceId, userId: device.assigned_user_id }, device.device_uuid);
	} else {
		broadcast('DEVICE_BLOCKED', { deviceId }, device.device_uuid);
	}

	return json({ ok: true });
};
