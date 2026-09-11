import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getOpenOrder, loadPrecheck, notifyOrder, waiterLocationId } from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const next = db
		.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM order_guests WHERE order_id = ?`)
		.get(orderId) as { n: number };
	const name = `Гость ${next.n + 1}`;
	const info = db
		.prepare(`INSERT INTO order_guests (order_id, name, sort_order) VALUES (?, ?, ?)`)
		.run(orderId, name, next.n);

	notifyOrder(orderId, locationId);
	return json({ guestId: Number(info.lastInsertRowid), precheck: loadPrecheck(orderId, locationId) }, { status: 201 });
};
