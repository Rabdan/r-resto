import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

const DEVICE_ROLES = ['waiter', 'kitchen'] as const;

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const body = (await request.json()) as {
		code?: string;
		userId?: number;
		role?: string;
	};

	const code = body.code?.trim();
	const userId = Number(body.userId);
	const role = body.role;
	if (!code || !userId) {
		return json({ error: 'code and userId required' }, { status: 400 });
	}
	if (!role || !DEVICE_ROLES.includes(role as (typeof DEVICE_ROLES)[number])) {
		return json({ error: 'invalid_role' }, { status: 400 });
	}

	const user = db
		.prepare(
			`SELECT id FROM users WHERE id = ? AND is_active = 1 AND is_blocked = 0`
		)
		.get(userId) as { id: number } | undefined;
	if (!user) return json({ error: 'user not found' }, { status: 404 });

	const locationRow = db
		.prepare(`SELECT location_id FROM user_locations WHERE user_id = ?`)
		.get(userId) as { location_id: number } | undefined;
	if (!locationRow) return json({ error: 'user has no location' }, { status: 400 });

	const device = db
		.prepare(`SELECT id, device_uuid FROM devices WHERE device_code = ?`)
		.get(code) as { id: number; device_uuid: string } | undefined;
	if (!device) return json({ error: 'device not found' }, { status: 404 });

	db.transaction(() => {
		db.prepare(
			`UPDATE devices
			 SET assigned_user_id = @userId,
			     location_id = @locationId,
			     role = @role,
			     status = 'active',
			     updated_at = datetime('now')
			 WHERE id = @id`
		).run({ userId, locationId: locationRow.location_id, role, id: device.id });
	})();

	broadcast('DEVICE_ACTIVATED', { deviceId: device.id, userId }, device.device_uuid);

	return json({ ok: true, deviceId: device.id });
};
