import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	getOpenOrder,
	loadOrder,
	mergeOrInsertHeld,
	notifyOrder,
	refreshOrderTotal,
	waiterLocationId
} from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const itemId = Number(params.itemId);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const body = (await request.json().catch(() => ({}))) as { toGuestId?: number; quantity?: number };
	const toGuestId = Number(body.toGuestId);
	const dest = db
		.prepare(`SELECT id, is_paid FROM order_guests WHERE id = ? AND order_id = ?`)
		.get(toGuestId, orderId) as { id: number; is_paid: number } | undefined;
	if (!dest) return json({ error: 'guest_not_found' }, { status: 400 });
	if (dest.is_paid) return json({ error: 'guest_paid' }, { status: 409 });

	const item = db
		.prepare(
			`SELECT id, guest_id, menu_item_id, title, price_cents, quantity, status, is_custom
			 FROM order_items WHERE id = ? AND order_id = ?`
		)
		.get(itemId, orderId) as
		| {
				id: number;
				guest_id: number;
				menu_item_id: number | null;
				title: string;
				price_cents: number;
				quantity: number;
				status: string;
				is_custom: number;
		  }
		| undefined;
	if (!item) return json({ error: 'not_found' }, { status: 404 });
	const source = db
		.prepare(`SELECT id, is_paid FROM order_guests WHERE id = ? AND order_id = ?`)
		.get(item.guest_id, orderId) as { id: number; is_paid: number } | undefined;
	if (!source) return json({ error: 'guest_not_found' }, { status: 400 });
	if (source.is_paid) return json({ error: 'guest_paid' }, { status: 409 });
	if (item.guest_id === dest.id) return json({ order: loadOrder(orderId, locationId) });

	let moveQty = Number(body.quantity);
	if (!Number.isFinite(moveQty) || moveQty < 1) {
		if (item.quantity === 1) moveQty = 1;
		else if (item.quantity === 2) moveQty = 1;
		else return json({ error: 'quantity_required' }, { status: 400 });
	}
	if (moveQty > item.quantity) return json({ error: 'quantity_too_high' }, { status: 400 });
	if (item.status !== 'held' && moveQty !== item.quantity) {
		return json({ error: 'cannot_split_sent' }, { status: 409 });
	}

	db.transaction(() => {
		if (moveQty === item.quantity) {
			db.prepare(`UPDATE order_items SET guest_id = ? WHERE id = ?`).run(dest.id, item.id);
		} else {
			db.prepare(`UPDATE order_items SET quantity = quantity - ? WHERE id = ?`).run(moveQty, item.id);
			mergeOrInsertHeld({
				orderId,
				guestId: dest.id,
				menuItemId: item.menu_item_id,
				title: item.title,
				priceCents: item.price_cents,
				quantity: moveQty,
				isCustom: item.is_custom === 1
			});
		}
		refreshOrderTotal(orderId);
	})();

	notifyOrder(orderId, locationId);
	return json({ order: loadOrder(orderId, locationId) });
};
