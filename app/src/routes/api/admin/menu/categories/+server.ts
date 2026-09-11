import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		color_hex?: string;
	};
	const name = (body.name ?? '').trim();
	if (!name) return json({ error: 'Укажи название категории' }, { status: 400 });
	const colorHex = COLOR_RE.test(body.color_hex ?? '') ? body.color_hex! : '#0F172A';

	const maxOrder = db
		.prepare(
			`SELECT COALESCE(MAX(sort_order), -1) AS m FROM menu_categories WHERE location_id = ?`
		)
		.get(locationId) as { m: number };

	const info = db
		.prepare(
			`INSERT INTO menu_categories (location_id, name, color_hex, sort_order)
			 VALUES (?, ?, ?, ?)`
		)
		.run(locationId, name, colorHex, maxOrder.m + 1);

	broadcast('MENU_UPDATED', {});
	return json({ ok: true, id: Number(info.lastInsertRowid) });
};
