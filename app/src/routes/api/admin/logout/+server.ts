import { json } from '@sveltejs/kit';
import { ADMIN_SESSION_COOKIE, clearAdminCookie, destroyAdminSession } from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	destroyAdminSession(event.cookies.get(ADMIN_SESSION_COOKIE));
	clearAdminCookie(event);
	return json({ ok: true });
};
