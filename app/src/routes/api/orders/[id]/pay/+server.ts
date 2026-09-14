import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import {
	getOpenOrder,
	guestItemsTotal,
	loadOrder,
	settleEmptyUnpaidGuests,
	waiterLocationId
} from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const existing = getOpenOrder(orderId, locationId);
	if (!existing) return json({ error: 'not_found' }, { status: 404 });
	if (existing.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	const body = (await request.json().catch(() => ({}))) as {
		guestId?: number;
		method?: 'cash' | 'cashless';
		cashReceivedCents?: number;
	};
	const guestId = Number(body.guestId);
	const method = body.method;
	if (method !== 'cash' && method !== 'cashless') {
		return json({ error: 'invalid_method' }, { status: 400 });
	}

	let cashReceived: number | null = null;
	let change = 0;
	let alreadyPaid = false;
	let emptyGuest = false;
	let cashTooLow = false;

	db.transaction(() => {
		const guest = db
			.prepare(`SELECT id, is_paid FROM order_guests WHERE id = ? AND order_id = ?`)
			.get(guestId, orderId) as { id: number; is_paid: number } | undefined;
		if (!guest) return;
		if (guest.is_paid) {
			alreadyPaid = true;
			return;
		}

		const amount = guestItemsTotal(orderId, guestId);
		if (amount <= 0) {
			emptyGuest = true;
			return;
		}

		if (method === 'cash') {
			cashReceived = Math.round(Number(body.cashReceivedCents));
			if (!Number.isFinite(cashReceived) || cashReceived < amount) {
				cashTooLow = true;
				return;
			}
			change = cashReceived - amount;
		}

		const paid = db
			.prepare(
				`UPDATE order_guests
				 SET is_paid = 1, payment_method = ?, amount_cents = ?, cash_received_cents = ?, change_cents = ?, paid_at = datetime('now')
				 WHERE id = ? AND is_paid = 0`
			)
			.run(method, amount, cashReceived, method === 'cash' ? change : 0, guestId);
		if (paid.changes === 0) {
			alreadyPaid = true;
			return;
		}

		settleEmptyUnpaidGuests(orderId);

		const unpaid = db
			.prepare(`SELECT COUNT(*) AS n FROM order_guests WHERE order_id = ? AND is_paid = 0`)
			.get(orderId) as { n: number };
		if (unpaid.n === 0) {
			db.prepare(
				`UPDATE orders SET status = 'closed', closed_at = datetime('now'),
				 total_amount_cents = COALESCE((SELECT SUM(quantity * price_cents) FROM order_items WHERE order_id = ?), 0)
				 WHERE id = ?`
			).run(orderId, orderId);
		}
	})();

	if (alreadyPaid) return json({ error: 'already_paid' }, { status: 409 });
	if (emptyGuest) return json({ error: 'empty_guest' }, { status: 409 });
	if (cashTooLow) return json({ error: 'cash_too_low' }, { status: 400 });

	const guestExists = db
		.prepare(`SELECT id FROM order_guests WHERE id = ? AND order_id = ?`)
		.get(guestId, orderId);
	if (!guestExists) return json({ error: 'guest_not_found' }, { status: 400 });

	const order = loadOrder(orderId, locationId);
	if (order?.status === 'closed') {
		broadcast('ORDER_CLOSED', { orderId, locationId });
	} else {
		broadcast('ORDER_UPDATED', { orderId, locationId });
	}

	return json({ order, changeCents: change });
};
