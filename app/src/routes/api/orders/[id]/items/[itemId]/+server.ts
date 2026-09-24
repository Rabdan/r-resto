import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import {
	getOpenOrder,
	loadOrder,
	notifyOrder,
	recomputeOrderReady,
	refreshOrderTotal,
	waiterLocationId
} from '$lib/server/orders';
import type { RequestHandler } from './$types';

type EditableItem = { id: number; quantity: number; status: string; guest_id: number };

function getEditableItem(orderId: number, itemId: number): EditableItem | undefined {
	return db
		.prepare(
			`SELECT i.id, i.quantity, i.status, i.guest_id
			 FROM order_items i
			 WHERE i.id = ? AND i.order_id = ? AND i.status IN ('held', 'pending', 'ready')`
		)
		.get(itemId, orderId) as EditableItem | undefined;
}

function guestIsPaid(orderId: number, guestId: number): boolean {
	const g = db
		.prepare(`SELECT is_paid FROM order_guests WHERE id = ? AND order_id = ?`)
		.get(guestId, orderId) as { is_paid: number } | undefined;
	return g?.is_paid === 1;
}

function notifyOrderChanged(orderId: number, locationId: number): void {
	const ready = recomputeOrderReady(orderId);
	notifyOrder(orderId, locationId);
	if (ready === 'ready') {
		const row = db
			.prepare(`SELECT number, hall_id FROM orders WHERE id = ?`)
			.get(orderId) as { number: number; hall_id: number } | undefined;
		broadcast('ORDER_READY', {
			orderId,
			locationId,
			number: row?.number,
			hallId: row?.hall_id
		});
	}
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
	const item = getEditableItem(orderId, itemId);
	if (!item) return json({ error: 'not_found' }, { status: 404 });
	if (guestIsPaid(orderId, item.guest_id)) return json({ error: 'guest_paid' }, { status: 409 });

	db.transaction(() => {
		const current = getEditableItem(orderId, itemId);
		if (!current) return;
		if (guestIsPaid(orderId, current.guest_id)) return;
		if (body.action === 'inc') {
			if (current.status === 'pending' || current.status === 'ready') {
				db.prepare(
					`UPDATE order_items
					 SET quantity = quantity + 1, status = 'held', sent_at = NULL, ready_at = NULL
					 WHERE id = ?`
				).run(itemId);
			} else {
				db.prepare(`UPDATE order_items SET quantity = quantity + 1 WHERE id = ?`).run(itemId);
			}
		} else if (body.action === 'dec') {
			if (current.quantity <= 1) {
				db.prepare(`DELETE FROM order_items WHERE id = ?`).run(itemId);
			} else if (current.status === 'pending' || current.status === 'ready') {
				db.prepare(
					`UPDATE order_items
					 SET quantity = quantity - 1, status = 'held', sent_at = NULL, ready_at = NULL
					 WHERE id = ?`
				).run(itemId);
			} else {
				db.prepare(`UPDATE order_items SET quantity = quantity - 1 WHERE id = ?`).run(itemId);
			}
		}
		refreshOrderTotal(orderId);
	})();

	notifyOrderChanged(orderId, locationId);
	return json({ order: loadOrder(orderId, locationId) });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const itemId = Number(params.itemId);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const item = getEditableItem(orderId, itemId);
	if (!item) return json({ error: 'not_found' }, { status: 404 });
	if (guestIsPaid(orderId, item.guest_id)) return json({ error: 'guest_paid' }, { status: 409 });

	db.transaction(() => {
		db.prepare(`DELETE FROM order_items WHERE id = ?`).run(itemId);
		refreshOrderTotal(orderId);
	})();

	notifyOrderChanged(orderId, locationId);
	return json({ order: loadOrder(orderId, locationId) });
};
