import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { deviceHasRole } from '$lib/types';
import type { RequestHandler } from './$types';

type CardRow = {
	order_id: number;
	number: number;
	created_at: string;
	waiter_name: string;
	hall_id: number;
	hall_name: string;
	hall_color: string;
};

type ItemRow = {
	id: number;
	order_id: number;
	title: string;
	description: string | null;
	quantity: number;
	status: string;
	ready_at: string | null;
	image_path: string | null;
};

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.device?.status !== 'active' || !deviceHasRole(locals.device, 'kitchen')) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const locationId = locals.device.locationId;
	const deviceId = locals.device.id;
	if (!locationId) return json({ cards: [] });

	const cards = db
		.prepare(
			`SELECT o.id AS order_id, o.number, o.created_at, u.name AS waiter_name,
			        h.id AS hall_id, h.name AS hall_name, h.color_hex AS hall_color
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.location_id = ? AND o.status = 'open'
			   AND EXISTS (
			     SELECT 1 FROM order_items i
			     WHERE i.order_id = o.id AND i.status IN ('pending', 'ready')
			   )
			   AND (
			     EXISTS (SELECT 1 FROM device_halls dh WHERE dh.device_id = ? AND dh.hall_id = o.hall_id)
			     OR NOT EXISTS (SELECT 1 FROM device_halls dh2 WHERE dh2.device_id = ?)
			   )
			 ORDER BY o.created_at DESC, o.id DESC`
		)
		.all(locationId, deviceId, deviceId) as CardRow[];

	const items = db
		.prepare(
			`SELECT i.id, i.order_id, i.title, m.description, i.quantity, i.status, i.ready_at, m.image_path
			 FROM order_items i
			 JOIN orders o ON o.id = i.order_id
			 LEFT JOIN menu_items m ON m.id = i.menu_item_id
			 WHERE o.location_id = ? AND o.status = 'open'
			   AND i.status IN ('pending', 'ready')
			 ORDER BY i.id`
		)
		.all(locationId) as ItemRow[];

	const byOrder = new Map<number, ItemRow[]>();
	for (const item of items) {
		const list = byOrder.get(item.order_id) ?? [];
		list.push(item);
		byOrder.set(item.order_id, list);
	}

	return json({
		cards: cards.map((card) => ({
			...card,
			items: (byOrder.get(card.order_id) ?? []).map((item) => ({
				id: item.id,
				title: item.title,
				description: item.description,
				quantity: item.quantity,
				status: item.status,
				ready_at: item.ready_at,
				image_path: item.image_path
			}))
		}))
	});
};
