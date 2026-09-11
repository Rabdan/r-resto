import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { getOpenOrder, loadPrecheck, notifyOrder, waiterLocationId } from '$lib/server/orders';
import type { RequestHandler } from './$types';

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
	return json({ precheck: loadPrecheck(orderId, locationId) });
};
