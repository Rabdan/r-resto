import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import type { RequestHandler } from './$types';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const cat = db
		.prepare(`SELECT id FROM menu_categories WHERE id = ? AND location_id = ?`)
		.get(id, locationId) as { id: number } | undefined;
	if (!cat) return json({ error: 'not_found' }, { status: 404 });

	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		color_hex?: string;
	};

	if (body.name !== undefined) {
		const name = (body.name ?? '').trim();
		if (!name) return json({ error: 'Название не может быть пустым' }, { status: 400 });
		db.prepare(`UPDATE menu_categories SET name = ? WHERE id = ?`).run(name, id);
	}
	if (body.color_hex !== undefined) {
		const colorHex = COLOR_RE.test(body.color_hex) ? body.color_hex : undefined;
		if (colorHex) {
			db.prepare(`UPDATE menu_categories SET color_hex = ? WHERE id = ?`).run(colorHex, id);
		}
	}

	broadcast('MENU_UPDATED', {});
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const cat = db
		.prepare(`SELECT id FROM menu_categories WHERE id = ? AND location_id = ?`)
		.get(id, locationId) as { id: number } | undefined;
	if (!cat) return json({ error: 'not_found' }, { status: 404 });

	const count = db
		.prepare(`SELECT COUNT(*) AS n FROM menu_items WHERE category_id = ? AND is_active = 1`)
		.get(id) as { n: number };
	if (count.n > 0 && url.searchParams.get('deleteItems') !== '1') {
		return json({ error: 'category_has_items', count: count.n }, { status: 409 });
	}

	db.transaction(() => {
		if (count.n > 0) {
			db.prepare(`UPDATE menu_items SET is_active = 0 WHERE category_id = ?`).run(id);
		}
		db.prepare(`UPDATE menu_categories SET is_active = 0 WHERE id = ?`).run(id);
	})();

	broadcast('MENU_UPDATED', {});
	return json({ ok: true });
};
