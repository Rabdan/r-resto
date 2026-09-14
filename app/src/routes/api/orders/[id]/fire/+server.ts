import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getOpenOrder, loadOrder, notifyOrder, waiterLocationId } from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const held = db
		.prepare(`SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND status = 'held'`)
		.get(orderId) as { n: number };
	if (held.n === 0) return json({ error: 'nothing_to_send' }, { status: 409 });

	db.prepare(
		`UPDATE order_items SET status = 'pending', sent_at = datetime('now'), ready_at = NULL
		 WHERE order_id = ? AND status = 'held'`
	).run(orderId);

	notifyOrder(orderId, locationId);
	return json({ order: loadOrder(orderId, locationId) });
};
