import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	getOpenOrder,
	loadPrecheck,
	notifyOrder,
	refreshOrderTotal,
	waiterLocationId
} from '$lib/server/orders';
import type { RequestHandler } from './$types';

function getHeldItem(orderId: number, itemId: number) {
	return db
		.prepare(
			`SELECT id, quantity, status FROM order_items WHERE id = ? AND order_id = ?`
		)
		.get(itemId, orderId) as { id: number; quantity: number; status: string } | undefined;
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const itemId = Number(params.itemId);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const body = (await request.json().catch(() => ({}))) as { action?: 'inc' | 'dec' };
	const item = getHeldItem(orderId, itemId);
	if (!item) return json({ error: 'not_found' }, { status: 404 });
	if (item.status !== 'held') return json({ error: 'already_sent' }, { status: 409 });

	db.transaction(() => {
		if (body.action === 'inc') {
			db.prepare(`UPDATE order_items SET quantity = quantity + 1 WHERE id = ?`).run(itemId);
		} else if (body.action === 'dec') {
			if (item.quantity <= 1) {
				db.prepare(`DELETE FROM order_items WHERE id = ?`).run(itemId);
			} else {
				db.prepare(`UPDATE order_items SET quantity = quantity - 1 WHERE id = ?`).run(itemId);
			}
		}
		refreshOrderTotal(orderId);
	})();

	notifyOrder(orderId, locationId);
	return json({ precheck: loadPrecheck(orderId, locationId) });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const itemId = Number(params.itemId);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const item = getHeldItem(orderId, itemId);
	if (!item) return json({ error: 'not_found' }, { status: 404 });
	if (item.status !== 'held') return json({ error: 'already_sent' }, { status: 409 });

	db.transaction(() => {
		db.prepare(`DELETE FROM order_items WHERE id = ?`).run(itemId);
		refreshOrderTotal(orderId);
	})();

	notifyOrder(orderId, locationId);
	return json({ precheck: loadPrecheck(orderId, locationId) });
};
