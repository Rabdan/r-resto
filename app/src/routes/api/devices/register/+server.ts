import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { generateDeviceCode, getDeviceByUuid } from '$lib/server/devices';
import type { RequestHandler } from './$types';

const CODE_RE = /^\d{3}-\d{3}$/;

function codeExists(code: string): boolean {
	return Boolean(db.prepare(`SELECT 1 FROM devices WHERE device_code = ?`).get(code));
}

export const POST: RequestHandler = async ({ locals, request }) => {
	let device = getDeviceByUuid(locals.deviceUuid);
	if (!device) {
		const body = (await request.json().catch(() => ({}))) as { deviceCode?: string };
		const clientCode = String(body.deviceCode ?? '').trim();
		const code = CODE_RE.test(clientCode) && !codeExists(clientCode) ? clientCode : generateDeviceCode();
		db.prepare(
			`INSERT INTO devices (device_code, device_uuid, status) VALUES (@code, @uuid, 'pending')`
		).run({ code, uuid: locals.deviceUuid });
		device = getDeviceByUuid(locals.deviceUuid);
	}

	return json({ device });
};
