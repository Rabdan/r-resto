import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const GET: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const halls = db
		.prepare(
			`SELECT h.id, h.name, h.color_hex, h.sort_order, h.is_active, h.closed_at, h.qr_image_path,
			        (SELECT COUNT(*) FROM orders o WHERE o.hall_id = h.id) AS orders_count
			 FROM halls h
			 WHERE h.location_id = ?
			 ORDER BY h.sort_order, h.id`
		)
		.all(locationId);

	return json({ halls });
};

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
	if (!name) return json({ error: 'Укажи название зала' }, { status: 400 });
	const colorHex = COLOR_RE.test(body.color_hex ?? '') ? body.color_hex! : '#0F172A';

	const maxOrder = db
		.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM halls WHERE location_id = ?`)
		.get(locationId) as { m: number };

	const info = db
		.prepare(
			`INSERT INTO halls (location_id, name, color_hex, sort_order, is_active)
			 VALUES (?, ?, ?, ?, 1)`
		)
		.run(locationId, name, colorHex, maxOrder.m + 1);

	return json({ ok: true, id: Number(info.lastInsertRowid) });
};
