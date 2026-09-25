import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { getOpenOrder, guestItemsTotal, loadOrder, waiterLocationId } from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const body = (await request.json().catch(() => ({}))) as { guestId?: number };
	const guestId = Number(body.guestId);

	let notFound = false;
	let noExcess = false;

	db.transaction(() => {
		const guest = db
			.prepare(`SELECT id, cash_cents, cashless_cents FROM order_guests WHERE id = ? AND order_id = ?`)
			.get(guestId, orderId) as
			| { id: number; cash_cents: number; cashless_cents: number }
			| undefined;
		if (!guest) {
			notFound = true;
			return;
		}

		const total = guestItemsTotal(orderId, guestId);
		const paid = guest.cash_cents + guest.cashless_cents;
		const excess = paid - total;
		if (excess <= 0) {
			noExcess = true;
			return;
		}

		const refundCash = Math.min(excess, guest.cash_cents);
		const refundCashless = Math.min(excess - refundCash, guest.cashless_cents);
		const newCash = guest.cash_cents - refundCash;
		const newCashless = guest.cashless_cents - refundCashless;

		db.prepare(
			`UPDATE order_guests
			 SET cash_cents = ?, cashless_cents = ?, amount_cents = ?,
			     shortfall_cents = 0, is_paid = 1
			 WHERE id = ?`
		).run(newCash, newCashless, newCash + newCashless, guestId);
	})();

	if (notFound) return json({ error: 'guest_not_found' }, { status: 404 });
	if (noExcess) return json({ error: 'no_excess' }, { status: 409 });

	broadcast('ORDER_UPDATED', { orderId, locationId });
	return json({ order: loadOrder(orderId, locationId) });
};
