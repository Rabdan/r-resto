import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.device?.status !== 'active' || locals.device.role !== 'kitchen') {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const locationId = locals.device.locationId;
	const cards = db
		.prepare(
			`SELECT o.id AS order_id, o.created_at, u.name AS waiter_name, h.name AS hall_name
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.location_id = ? AND o.status = 'open'
			   AND EXISTS (
			     SELECT 1 FROM order_items i
			     WHERE i.order_id = o.id AND i.status IN ('pending', 'ready', 'out_of_stock')
			   )
			 ORDER BY o.created_at ASC`
		)
		.all(locationId);

	return json({ cards });
};
