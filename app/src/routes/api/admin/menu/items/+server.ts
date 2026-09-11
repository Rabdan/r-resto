import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as {
		category_id?: number;
		title?: string;
		description?: string;
		price_cents?: number;
		image_path?: string | null;
		is_available?: boolean;
	};

	const categoryId = Number(body.category_id);
	const title = (body.title ?? '').trim();
	if (!categoryId || !title) return json({ error: 'Укажи категорию и название' }, { status: 400 });

	const cat = db
		.prepare(`SELECT id FROM menu_categories WHERE id = ? AND location_id = ?`)
		.get(categoryId, locationId) as { id: number } | undefined;
	if (!cat) return json({ error: 'category_not_found' }, { status: 404 });

	const priceCents = Math.max(0, Math.round(Number(body.price_cents) || 0));
	const maxOrder = db
		.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM menu_items WHERE category_id = ?`)
		.get(categoryId) as { m: number };

	const info = db
		.prepare(
			`INSERT INTO menu_items
			 (location_id, category_id, title, description, price_cents, image_path, is_available, sort_order)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			locationId,
			categoryId,
			title,
			(body.description ?? '').trim(),
			priceCents,
			body.image_path ?? null,
			body.is_available === false ? 0 : 1,
			maxOrder.m + 1
		);

	broadcast('MENU_UPDATED', {});
	return json({ ok: true, id: Number(info.lastInsertRowid) });
};
