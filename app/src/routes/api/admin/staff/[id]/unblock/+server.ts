import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const userId = Number(params.id);
	const target = db
		.prepare(`SELECT id FROM users WHERE id = ?`)
		.get(userId) as { id: number } | undefined;
	if (!target) return json({ error: 'not_found' }, { status: 404 });

	db.transaction(() => {
		db.prepare(`UPDATE users SET is_blocked = 0 WHERE id = ?`).run(userId);
		db.prepare(
			`UPDATE devices SET status = 'active', blocked_at = NULL, updated_at = datetime('now')
			 WHERE assigned_user_id = ? AND status = 'suspended'`
		).run(userId);
	})();

	const uuids = db
		.prepare(`SELECT device_uuid FROM devices WHERE assigned_user_id = ?`)
		.all(userId) as Array<{ device_uuid: string }>;
	for (const { device_uuid } of uuids) {
		broadcast('DEVICE_ACTIVATED', { userId }, device_uuid);
	}

	return json({ ok: true });
};
