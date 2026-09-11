import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pinIsTaken, requireAdmin, resolveAdminPinHash } from '$lib/server/admin';
import type { RequestHandler } from './$types';

function locationIdFor(admin: App.Locals['admin']): number | null {
	const id = admin?.locationId;
	if (id) return id;
	const row = db.prepare(`SELECT id FROM locations ORDER BY id LIMIT 1`).get() as
		| { id: number }
		| undefined;
	return row?.id ?? null;
}

export const GET: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const staff = db
		.prepare(
			`SELECT id, name, role, is_active, is_blocked, is_superadmin,
			        (pin_hash IS NOT NULL AND pin_hash != '') AS has_pin
			 FROM users
			 ORDER BY is_superadmin DESC, role, name`
		)
		.all();

	const devices = db
		.prepare(
			`SELECT d.id, d.device_code, d.device_name, d.status, d.assigned_user_id,
			        d.role, d.blocked_at,
			        u.name AS user_name
			 FROM devices d
			 LEFT JOIN users u ON u.id = d.assigned_user_id
			 ORDER BY d.id DESC`
		)
		.all();

	return json({ staff, devices });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		pin?: string;
	};
	const name = (body.name ?? '').trim();
	if (!name) return json({ error: 'Укажи имя сотрудника' }, { status: 400 });

	let role = 'staff';
	let pinHash: string | null = null;
	if (body.pin !== undefined) {
		const resolved = resolveAdminPinHash(body.pin);
		if (resolved.error) return json({ error: resolved.error }, { status: 400 });
		if (resolved.hash) {
			if (pinIsTaken((body.pin ?? '').trim())) {
				return json({ error: 'Такой пароль уже используется. Введите новый PIN' }, { status: 409 });
			}
			role = 'admin';
			pinHash = resolved.hash;
		}
	}

	const locationId = locationIdFor(locals.admin);
	if (!locationId) return json({ error: 'Нет заведения' }, { status: 400 });

	const info = db
		.transaction(() => {
			const res = db
				.prepare(
					`INSERT INTO users (name, role, pin_hash, is_active)
					 VALUES (@name, @role, @pinHash, 1)`
				)
				.run({ name, role, pinHash });
			const userId = Number(res.lastInsertRowid);
			db.prepare(
				`INSERT INTO user_locations (user_id, location_id) VALUES (?, ?)`
			).run(userId, locationId);
			return { userId };
		})();

	return json({ ok: true, id: info.userId });
};
