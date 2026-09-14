import { getDb } from './db';
import type { DeviceSession, DeviceStatus, UserRole } from '$lib/types';

type DeviceRow = {
	id: number;
	device_code: string;
	status: DeviceStatus;
	assigned_user_id: number | null;
	location_id: number | null;
	user_name: string | null;
	role: UserRole | null;
	location_name: string | null;
};

const POS_ROLES: UserRole[] = ['waiter', 'kitchen'];

const sqlByUuid = `
	SELECT
		d.id,
		d.device_code,
		d.status,
		d.assigned_user_id,
		d.location_id,
		u.name AS user_name,
		d.role AS role,
		l.name AS location_name
	FROM devices d
	LEFT JOIN users u ON u.id = d.assigned_user_id
	LEFT JOIN locations l ON l.id = d.location_id
	WHERE d.device_uuid = ?
`;

export function normalizePosRoles(input: unknown): UserRole[] {
	const raw = Array.isArray(input) ? input : [];
	const set = new Set<UserRole>();
	for (const value of raw) {
		if (value === 'waiter' || value === 'kitchen') set.add(value);
	}
	return POS_ROLES.filter((role) => set.has(role));
}

export function parsePosRolesBody(body: { roles?: unknown; role?: unknown }): UserRole[] | null {
	if (Array.isArray(body.roles)) return normalizePosRoles(body.roles);
	if (typeof body.role === 'string') return normalizePosRoles([body.role]);
	return null;
}

export function loadDeviceRoles(deviceId: number, fallback: UserRole | null): UserRole[] {
	const rows = getDb()
		.prepare(`SELECT role FROM device_roles WHERE device_id = ?`)
		.all(deviceId) as Array<{ role: UserRole }>;
	const fromTable = normalizePosRoles(rows.map((row) => row.role));
	if (fromTable.length) return fromTable;
	return fallback ? [fallback] : [];
}

export function rolesByDeviceId(): Map<number, UserRole[]> {
	const rows = getDb()
		.prepare(`SELECT device_id, role FROM device_roles`)
		.all() as Array<{ device_id: number; role: UserRole }>;
	const map = new Map<number, UserRole[]>();
	for (const row of rows) {
		const list = map.get(row.device_id) ?? [];
		list.push(row.role);
		map.set(row.device_id, list);
	}
	for (const [id, list] of map) {
		map.set(id, normalizePosRoles(list));
	}
	return map;
}

export function replaceDeviceRoles(deviceId: number, roles: UserRole[]): void {
	const db = getDb();
	db.prepare(`DELETE FROM device_roles WHERE device_id = ?`).run(deviceId);
	const insert = db.prepare(`INSERT INTO device_roles (device_id, role) VALUES (?, ?)`);
	for (const role of roles) insert.run(deviceId, role);
	db.prepare(`UPDATE devices SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(
		roles[0] ?? null,
		deviceId
	);
}

export function getDeviceByUuid(uuid: string): DeviceSession | null {
	const row = getDb().prepare(sqlByUuid).get(uuid) as DeviceRow | undefined;
	if (!row) return null;
	const roles = loadDeviceRoles(row.id, row.role);
	return {
		id: row.id,
		deviceCode: row.device_code,
		status: row.status,
		userId: row.assigned_user_id,
		userName: row.user_name,
		role: roles[0] ?? row.role,
		roles,
		locationId: row.location_id,
		locationName: row.location_name
	};
}

export function generateDeviceCode(): string {
	const db = getDb();
	for (let i = 0; i < 20; i++) {
		const n = String(Math.floor(100000 + Math.random() * 900000));
		const code = `${n.slice(0, 3)}-${n.slice(3)}`;
		const exists = db.prepare('SELECT 1 FROM devices WHERE device_code = ?').get(code);
		if (!exists) return code;
	}
	throw new Error('Could not generate unique device code');
}
