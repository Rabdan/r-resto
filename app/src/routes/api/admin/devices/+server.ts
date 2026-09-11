import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const users = db
		.prepare(
			`SELECT id, name FROM users
			 WHERE is_active = 1 AND role = 'staff'
			 ORDER BY name`
		)
		.all();
	const devices = db
		.prepare(
			`SELECT d.id, d.device_code, d.status, d.role, u.name AS user_name
			 FROM devices d
			 LEFT JOIN users u ON u.id = d.assigned_user_id
			 ORDER BY d.id DESC`
		)
		.all();

	return json({ users, devices });
};
