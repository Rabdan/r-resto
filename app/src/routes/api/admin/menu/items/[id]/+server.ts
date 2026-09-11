import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const item = db
		.prepare(
			`SELECT id, category_id FROM menu_items WHERE id = ? AND location_id = ?`
		)
		.get(id, locationId) as { id: number; category_id: number } | undefined;
	if (!item) return json({ error: 'not_found' }, { status: 404 });

	const body = (await request.json().catch(() => ({}))) as {
		category_id?: number;
		title?: string;
		description?: string;
		price_cents?: number;
		image_path?: string | null;
		is_available?: boolean;
	};

	if (body.category_id !== undefined) {
		const categoryId = Number(body.category_id);
		const cat = db
			.prepare(`SELECT id FROM menu_categories WHERE id = ? AND location_id = ?`)
			.get(categoryId, locationId) as { id: number } | undefined;
		if (!cat) return json({ error: 'category_not_found' }, { status: 404 });
		if (categoryId !== item.category_id) {
			const maxOrder = db
				.prepare(
					`SELECT COALESCE(MAX(sort_order), -1) AS m FROM menu_items WHERE category_id = ?`
				)
				.get(categoryId) as { m: number };
			db.prepare(`UPDATE menu_items SET category_id = ?, sort_order = ? WHERE id = ?`).run(
				categoryId,
				maxOrder.m + 1,
				id
			);
		}
	}

	if (body.title !== undefined) {
		const title = (body.title ?? '').trim();
		if (!title) return json({ error: 'Название не может быть пустым' }, { status: 400 });
		db.prepare(`UPDATE menu_items SET title = ? WHERE id = ?`).run(title, id);
	}
	if (body.description !== undefined) {
		db.prepare(`UPDATE menu_items SET description = ? WHERE id = ?`).run(
			(body.description ?? '').trim(),
			id
		);
	}
	if (body.price_cents !== undefined) {
		db.prepare(`UPDATE menu_items SET price_cents = ? WHERE id = ?`).run(
			Math.max(0, Math.round(Number(body.price_cents) || 0)),
			id
		);
	}
	if (body.image_path !== undefined) {
		db.prepare(`UPDATE menu_items SET image_path = ? WHERE id = ?`).run(
			body.image_path ?? null,
			id
		);
	}
	if (body.is_available !== undefined) {
		db.prepare(`UPDATE menu_items SET is_available = ? WHERE id = ?`).run(
			body.is_available ? 1 : 0,
			id
		);
	}

	broadcast('MENU_UPDATED', {});
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const item = db
		.prepare(`SELECT id FROM menu_items WHERE id = ? AND location_id = ?`)
		.get(id, locationId) as { id: number } | undefined;
	if (!item) return json({ error: 'not_found' }, { status: 404 });

	db.prepare(`UPDATE menu_items SET is_active = 0 WHERE id = ?`).run(id);
	broadcast('MENU_UPDATED', {});
	return json({ ok: true });
};
