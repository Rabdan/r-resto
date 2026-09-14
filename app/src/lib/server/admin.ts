import type { AdminSession } from '$lib/types';
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { getDb } from './db';
import { hashPin, isValidPin, verifyPin } from './pin';

export const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_HOURS = 12;

export type { AdminSession };

export function getAdminFromToken(token: string | undefined): AdminSession | null {
	if (!token) return null;
	const db = getDb();
	db.prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`).run();
	const row = db
		.prepare(
			`SELECT u.id, u.name, u.is_superadmin, ul.location_id
			 FROM admin_sessions s
			 JOIN users u ON u.id = s.user_id
			 LEFT JOIN user_locations ul ON ul.user_id = u.id
			 WHERE s.token = ?
			   AND s.expires_at >= datetime('now')
			   AND u.role = 'admin'
			   AND u.is_active = 1
			   AND u.is_blocked = 0
			 LIMIT 1`
		)
		.get(token) as
		| { id: number; name: string; is_superadmin: number; location_id: number | null }
		| undefined;
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		isSuperadmin: row.is_superadmin === 1,
		locationId: row.location_id
	};
}

export function createAdminSession(userId: number): string {
	const db = getDb();
	const token = randomBytes(32).toString('hex');
	db.prepare(
		`INSERT INTO admin_sessions (token, user_id, expires_at)
		 VALUES (?, ?, datetime('now', '+${SESSION_HOURS} hours'))`
	).run(token, userId);
	return token;
}

export function destroyAdminSession(token: string | undefined): void {
	if (!token) return;
	getDb().prepare(`DELETE FROM admin_sessions WHERE token = ?`).run(token);
}

export function listLoginAdmins(): Array<{ id: number; name: string }> {
	return getDb()
		.prepare(
			`SELECT id, name FROM users WHERE role = 'admin' AND is_active = 1 AND is_blocked = 0 ORDER BY is_superadmin DESC, name`
		)
		.all() as Array<{ id: number; name: string }>;
}

export function authenticateAdminByPin(pin: string, userId?: number): AdminSession | null {
	if (!isValidPin(pin)) return null;
	const rows = (
		userId != null
			? getDb()
					.prepare(
						`SELECT id, name, pin_hash, is_superadmin FROM users
						 WHERE role = 'admin' AND is_active = 1 AND is_blocked = 0 AND id = ?`
					)
					.all(userId)
			: getDb()
					.prepare(
						`SELECT id, name, pin_hash, is_superadmin FROM users
						 WHERE role = 'admin' AND is_active = 1 AND is_blocked = 0`
					)
					.all()
	) as Array<{ id: number; name: string; pin_hash: string | null; is_superadmin: number }>;

	for (const row of rows) {
		if (!row.pin_hash) continue;
		if (!verifyPin(pin, row.pin_hash)) continue;
		const location = getDb()
			.prepare(`SELECT location_id FROM user_locations WHERE user_id = ? LIMIT 1`)
			.get(row.id) as { location_id: number } | undefined;
		return {
			id: row.id,
			name: row.name,
			isSuperadmin: row.is_superadmin === 1,
			locationId: location?.location_id ?? null
		};
	}
	return null;
}

export function pinIsTaken(pin: string, excludeUserId?: number): boolean {
	if (!isValidPin(pin)) return false;
	const rows = getDb()
		.prepare(
			`SELECT id, pin_hash FROM users
			 WHERE role = 'admin' AND pin_hash IS NOT NULL AND pin_hash != ''`
		)
		.all() as Array<{ id: number; pin_hash: string }>;
	for (const row of rows) {
		if (row.id === excludeUserId) continue;
		if (verifyPin(pin, row.pin_hash)) return true;
	}
	return false;
}

export function setAdminCookie(event: RequestEvent, token: string): void {
	event.cookies.set(ADMIN_SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		priority: 'high',
		maxAge: SESSION_HOURS * 60 * 60
	});
}

export function clearAdminCookie(event: RequestEvent): void {
	event.cookies.delete(ADMIN_SESSION_COOKIE, { path: '/' });
}

export function requireAdmin(locals: App.Locals) {
	if (!locals.admin) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	return null;
}

/**
 * Админ входит по PIN. Пустой PIN или «0000» (все нули) означают
 * отсутствие доступа в админку — hash не создаётся.
 */
export function resolveAdminPinHash(pin: string | undefined): {
	hash: string | null;
	error: string | null;
} {
	const p = (pin ?? '').trim();
	if (!p || /^0+$/.test(p)) return { hash: null, error: null };
	if (!isValidPin(p)) return { hash: null, error: 'Пароль: 4–8 цифр' };
	return { hash: hashPin(p), error: null };
}
