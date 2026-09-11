import type { Handle } from '@sveltejs/kit';
import { ADMIN_SESSION_COOKIE, getAdminFromToken } from '$lib/server/admin';
import { getDeviceByUuid } from '$lib/server/devices';

export const handle: Handle = async ({ event, resolve }) => {
	let uuid = event.cookies.get('device_uuid');
	if (!uuid) {
		uuid = crypto.randomUUID();
		event.cookies.set('device_uuid', uuid, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365 * 5
		});
	}

	event.locals.deviceUuid = uuid;
	event.locals.device = getDeviceByUuid(uuid);
	event.locals.admin = getAdminFromToken(event.cookies.get(ADMIN_SESSION_COOKIE));

	return resolve(event);
};
