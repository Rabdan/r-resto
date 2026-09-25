import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	getOpenOrder,
	loadOrder,
	mergeOrInsertHeld,
	notifyOrder,
	recomputeGuestPayments,
	refreshOrderTotal,
	waiterLocationId
} from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const body = (await request.json().catch(() => ({}))) as {
		guestId?: number;
		menuItemId?: number;
		title?: string;
		priceCents?: number;
		quantity?: number;
	};

	const guest = db
		.prepare(`SELECT id FROM order_guests WHERE id = ? AND order_id = ?`)
		.get(Number(body.guestId), orderId) as { id: number } | undefined;
	if (!guest) return json({ error: 'guest_not_found' }, { status: 400 });

	const qty = Math.max(1, Math.floor(Number(body.quantity) || 1));

	if (body.menuItemId) {
		const item = db
			.prepare(
				`SELECT id, title, price_cents, is_available FROM menu_items
				 WHERE id = ? AND location_id = ? AND is_active = 1`
			)
			.get(Number(body.menuItemId), locationId) as
			| { id: number; title: string; price_cents: number; is_available: number }
			| undefined;
		if (!item) return json({ error: 'menu_not_found' }, { status: 404 });
		if (!item.is_available) return json({ error: 'stop_list' }, { status: 409 });

		db.transaction(() => {
			mergeOrInsertHeld({
				orderId,
				guestId: guest.id,
				menuItemId: item.id,
				title: item.title,
				priceCents: item.price_cents,
				quantity: qty,
				isCustom: false
			});
			refreshOrderTotal(orderId);
			recomputeGuestPayments(orderId);
		})();
	} else {
		const title = (body.title ?? '').trim();
		const priceCents = Math.round(Number(body.priceCents));
		if (title.length < 1 || !Number.isFinite(priceCents) || priceCents < 0) {
			return json({ error: 'invalid_custom' }, { status: 400 });
		}
		db.transaction(() => {
			mergeOrInsertHeld({
				orderId,
				guestId: guest.id,
				menuItemId: null,
				title,
				priceCents,
				quantity: qty,
				isCustom: true
			});
			refreshOrderTotal(orderId);
			recomputeGuestPayments(orderId);
		})();
	}

	notifyOrder(orderId, locationId);
	return json({ order: loadOrder(orderId, locationId) });
};
