import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const categories = db
		.prepare(
			`SELECT id, name, color_hex, sort_order
			 FROM menu_categories
			 WHERE location_id = ? AND is_active = 1
			 ORDER BY sort_order, id`
		)
		.all(locationId) as Array<{
		id: number;
		name: string;
		color_hex: string;
		sort_order: number;
	}>;

	const items = db
		.prepare(
			`SELECT id, category_id, title, description, price_cents, image_path, is_available, is_active, sort_order
			 FROM menu_items
			 WHERE location_id = ? AND is_active = 1
			 ORDER BY sort_order, id`
		)
		.all(locationId) as Array<{
		id: number;
		category_id: number;
		title: string;
		description: string;
		price_cents: number;
		image_path: string | null;
		is_available: number;
		is_active: number;
		sort_order: number;
	}>;

	const byCategory = new Map<number, typeof items>();
	for (const item of items) {
		const list = byCategory.get(item.category_id) ?? [];
		list.push(item);
		byCategory.set(item.category_id, list);
	}

	const tree = categories.map((cat) => ({
		...cat,
		items: byCategory.get(cat.id) ?? []
	}));

	return json({ categories: tree });
};
