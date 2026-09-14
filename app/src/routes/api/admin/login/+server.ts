import { json } from '@sveltejs/kit';
import {
	authenticateAdminByPin,
	createAdminSession,
	listLoginAdmins,
	setAdminCookie
} from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json({ admins: listLoginAdmins() });
};

export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => ({}))) as { pin?: string; userId?: number };
	const pin = String(body.pin ?? '');
	if (!pin) {
		return json({ error: 'invalid' }, { status: 400 });
	}

	const userId = body.userId != null ? Number(body.userId) : undefined;
	if (userId != null && !Number.isFinite(userId)) {
		return json({ error: 'invalid' }, { status: 400 });
	}

	const admin = authenticateAdminByPin(pin, userId);
	if (!admin) {
		return json({ error: 'invalid_pin' }, { status: 401 });
	}

	const token = createAdminSession(admin.id);
	setAdminCookie(event, token);
	return json({ admin: { id: admin.id, name: admin.name, isSuperadmin: admin.isSuperadmin } });
};
