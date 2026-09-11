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

export function getDeviceByUuid(uuid: string): DeviceSession | null {
	const row = getDb().prepare(sqlByUuid).get(uuid) as DeviceRow | undefined;
	if (!row) return null;
	return {
		id: row.id,
		deviceCode: row.device_code,
		status: row.status,
		userId: row.assigned_user_id,
		userName: row.user_name,
		role: row.role,
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
