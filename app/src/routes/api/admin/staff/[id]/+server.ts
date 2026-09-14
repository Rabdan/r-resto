import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pinIsTaken, requireAdmin, resolveAdminPinHash } from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const userId = Number(params.id);
	const target = db
		.prepare(`SELECT id, name, role, is_superadmin FROM users WHERE id = ?`)
		.get(userId) as { id: number; name: string; role: string; is_superadmin: number } | undefined;
	if (!target) return json({ error: 'not_found' }, { status: 404 });

	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		pin?: string;
		admin?: boolean;
	};

	const name = body.name !== undefined ? (body.name ?? '').trim() : undefined;
	if (name !== undefined && !name) return json({ error: 'Имя не может быть пустым' }, { status: 400 });

	let pinUpdate: { role: string; hash: string | null } | null = null;
	if (target.is_superadmin !== 1) {
		if (body.admin === false) {
			pinUpdate = { role: 'staff', hash: null };
		} else if (body.pin !== undefined) {
			const resolved = resolveAdminPinHash(body.pin);
			if (resolved.error) return json({ error: resolved.error }, { status: 400 });
			if (resolved.hash && pinIsTaken((body.pin ?? '').trim(), userId)) {
				return json({ error: 'Такой пароль уже используется. Введите новый PIN' }, { status: 409 });
			}
			pinUpdate = { role: resolved.hash ? 'admin' : 'staff', hash: resolved.hash };
		} else if (body.admin === true && target.role !== 'admin') {
			return json({ error: 'Задай пароль админки' }, { status: 400 });
		}
	}

	db.transaction(() => {
		if (name !== undefined) {
			db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(name, userId);
		}
		if (pinUpdate) {
			db.prepare(`UPDATE users SET role = ?, pin_hash = ? WHERE id = ?`).run(
				pinUpdate.role,
				pinUpdate.hash,
				userId
			);
		}
	})();

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const userId = Number(params.id);
	if (userId === locals.admin!.id) {
		return json({ error: 'Нельзя удалить самого себя' }, { status: 400 });
	}
	const target = db
		.prepare(`SELECT id, is_superadmin, is_active FROM users WHERE id = ?`)
		.get(userId) as { id: number; is_superadmin: number; is_active: number } | undefined;
	if (!target) return json({ error: 'not_found' }, { status: 404 });
	if (target.is_superadmin === 1) {
		return json({ error: 'Нельзя удалить суперадмина' }, { status: 400 });
	}

	db.transaction(() => {
		db.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(userId);
		db.prepare(`UPDATE devices SET assigned_user_id = NULL, status = 'terminated', blocked_at = datetime('now') WHERE assigned_user_id = ?`).run(userId);
	})();

	return json({ ok: true });
};
