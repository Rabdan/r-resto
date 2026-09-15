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
	const cat = db
		.prepare(`SELECT id, sort_order FROM menu_categories WHERE id = ? AND location_id = ?`)
		.get(id, locationId) as { id: number; sort_order: number } | undefined;
	if (!cat) return json({ error: 'not_found' }, { status: 404 });

	const body = (await request.json().catch(() => ({}))) as { direction?: 'up' | 'down' };
	if (body.direction !== 'up' && body.direction !== 'down') {
		return json({ error: 'invalid_direction' }, { status: 400 });
	}

	const siblings = db
		.prepare(
			`SELECT id, sort_order FROM menu_categories
			 WHERE location_id = ? AND is_active = 1
			 ORDER BY sort_order, id`
		)
		.all(locationId) as Array<{ id: number; sort_order: number }>;
	const idx = siblings.findIndex((s) => s.id === id);
	if (idx < 0) return json({ ok: true });
	const targetIdx = body.direction === 'up' ? idx - 1 : idx + 1;
	if (targetIdx < 0 || targetIdx >= siblings.length) return json({ ok: true });
	const b = siblings[targetIdx];
	db.transaction(() => {
		db.prepare(`UPDATE menu_categories SET sort_order = ? WHERE id = ?`).run(b.sort_order, id);
		db.prepare(`UPDATE menu_categories SET sort_order = ? WHERE id = ?`).run(cat.sort_order, b.id);
	})();

	broadcast('MENU_UPDATED', {});
	return json({ ok: true });
};
