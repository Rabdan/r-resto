import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const userId = Number(params.id);
	const target = db
		.prepare(`SELECT id, is_active FROM users WHERE id = ?`)
		.get(userId) as { id: number; is_active: number } | undefined;
	if (!target) return json({ error: 'not_found' }, { status: 404 });

	db.prepare(`UPDATE users SET is_active = 1 WHERE id = ?`).run(userId);
	return json({ ok: true });
};
