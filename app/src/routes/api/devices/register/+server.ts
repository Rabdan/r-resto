import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { generateDeviceCode, getDeviceByUuid } from '$lib/server/devices';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	let device = getDeviceByUuid(locals.deviceUuid);
	if (!device) {
		const code = generateDeviceCode();
		db.prepare(
			`INSERT INTO devices (device_code, device_uuid, status) VALUES (@code, @uuid, 'pending')`
		).run({ code, uuid: locals.deviceUuid });
		device = getDeviceByUuid(locals.deviceUuid);
	}

	return json({ device });
};
