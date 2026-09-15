import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const locationId = locals.admin?.locationId ?? (locals.device?.status === 'active' ? locals.device.locationId : null);
	if (!locationId) {
		return json({ error: 'forbidden' }, { status: 403 });
	}
	const categories = db
		.prepare(
			`SELECT id, name, color_hex, sort_order FROM menu_categories WHERE location_id = ? AND is_active = 1 ORDER BY sort_order`
		)
		.all(locationId);
	const items = db
		.prepare(
			`SELECT id, category_id, title, description, price_cents, image_path, is_available
			 FROM menu_items
			 WHERE location_id = ? AND is_active = 1
			 ORDER BY sort_order, id`
		)
		.all(locationId);

	return json({ categories, items });
};
