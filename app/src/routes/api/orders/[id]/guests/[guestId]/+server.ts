import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getOpenOrder, loadOrder, notifyOrder, waiterLocationId } from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const guestId = Number(params.guestId);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const guest = db
		.prepare(`SELECT id, is_paid FROM order_guests WHERE id = ? AND order_id = ?`)
		.get(guestId, orderId) as { id: number; is_paid: number } | undefined;
	if (!guest) return json({ error: 'not_found' }, { status: 404 });
	if (guest.is_paid) return json({ error: 'guest_paid' }, { status: 409 });

	const guestCount = (
		db.prepare(`SELECT COUNT(*) AS n FROM order_guests WHERE order_id = ?`).get(orderId) as {
			n: number;
		}
	).n;
	if (guestCount <= 1) return json({ error: 'last_guest' }, { status: 409 });

	const items = (
		db
			.prepare(`SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND guest_id = ?`)
			.get(orderId, guestId) as { n: number }
	).n;
	if (items > 0) return json({ error: 'guest_has_items' }, { status: 409 });

	db.prepare(`DELETE FROM order_guests WHERE id = ?`).run(guestId);
	notifyOrder(orderId, locationId);
	return json({ order: loadOrder(orderId, locationId) });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const guestId = Number(params.guestId);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const body = (await request.json().catch(() => ({}))) as { name?: string };
	const name = (body.name ?? '').trim();
	if (name.length < 1) return json({ error: 'invalid_name' }, { status: 400 });

	const guest = db
		.prepare(`SELECT id FROM order_guests WHERE id = ? AND order_id = ?`)
		.get(guestId, orderId);
	if (!guest) return json({ error: 'not_found' }, { status: 404 });

	db.prepare(`UPDATE order_guests SET name = ? WHERE id = ?`).run(name, guestId);
	notifyOrder(orderId, locationId);
	return json({ order: loadOrder(orderId, locationId) });
};
