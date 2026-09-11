import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const item = db
		.prepare(`SELECT id, category_id FROM menu_items WHERE id = ? AND location_id = ?`)
		.get(id, locationId) as { id: number; category_id: number } | undefined;
	if (!item) return json({ error: 'not_found' }, { status: 404 });

	const body = (await request.json().catch(() => ({}))) as { category_id?: number };
	const categoryId = Number(body.category_id);
	if (!categoryId || categoryId === item.category_id) {
		return json({ ok: true });
	}

	const cat = db
		.prepare(`SELECT id FROM menu_categories WHERE id = ? AND location_id = ?`)
		.get(categoryId, locationId) as { id: number } | undefined;
	if (!cat) return json({ error: 'category_not_found' }, { status: 404 });

	db.transaction(() => {
		const maxOrder = db
			.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM menu_items WHERE category_id = ?`)
			.get(categoryId) as { m: number };
		db.prepare(`UPDATE menu_items SET category_id = ?, sort_order = ? WHERE id = ?`).run(
			categoryId,
			maxOrder.m + 1,
			id
		);
	})();

	broadcast('MENU_UPDATED', {});
	return json({ ok: true });
};
