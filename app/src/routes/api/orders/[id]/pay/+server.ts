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
		cashlessCents?: number;
		cashReceivedCents?: number;
	};
	const guestId = Number(body.guestId);
	const cashless = Math.round(Number(body.cashlessCents ?? 0)) || 0;
	const cashReceived = Math.round(Number(body.cashReceivedCents ?? 0)) || 0;

	let change = 0;
	let alreadyPaid = false;
	let emptyGuest = false;
	let nothingCollected = false;

	db.transaction(() => {
		const guest = db
			.prepare(
				`SELECT id, is_paid, cash_cents, cashless_cents FROM order_guests WHERE id = ? AND order_id = ?`
			)
			.get(guestId, orderId) as
			| { id: number; is_paid: number; cash_cents: number; cashless_cents: number }
			| undefined;
		if (!guest) return;

		const total = guestItemsTotal(orderId, guestId);
		if (total <= 0) {
			emptyGuest = true;
			return;
		}

		const alreadyCollected = guest.cash_cents + guest.cashless_cents;
		const due = total - alreadyCollected;
		if (due <= 0) {
			alreadyPaid = true;
			return;
		}

		const card = Math.min(Math.max(cashless, 0), due);
		const remaining = due - card;
		const cash = Math.min(Math.max(cashReceived, 0), remaining);
		const collected = card + cash;
		if (collected <= 0) {
			nothingCollected = true;
			return;
		}

		change = cashReceived - cash;
		const newCash = guest.cash_cents + cash;
		const newCashless = guest.cashless_cents + card;
		const shortfall = total - newCash - newCashless;
		const isPaid = shortfall <= 0 ? 1 : 0;
		const method = card > 0 && cash > 0 ? 'mixed' : card > 0 ? 'cashless' : 'cash';

		db.prepare(
			`UPDATE order_guests
			 SET is_paid = ?, payment_method = ?, amount_cents = ?,
			     cash_cents = ?, cashless_cents = ?,
			     cash_received_cents = ?, change_cents = ?,
			     shortfall_cents = ?, paid_at = datetime('now')
			 WHERE id = ?`
		).run(
			isPaid,
			method,
			newCash + newCashless,
			newCash,
			newCashless,
			cashReceived,
			change,
			shortfall,
			guestId
		);

		settleEmptyUnpaidGuests(orderId);
	})();

	if (alreadyPaid) return json({ error: 'already_paid' }, { status: 409 });
	if (emptyGuest) return json({ error: 'empty_guest' }, { status: 409 });
	if (nothingCollected) return json({ error: 'nothing_collected' }, { status: 400 });

	const guestExists = db
		.prepare(`SELECT id FROM order_guests WHERE id = ? AND order_id = ?`)
		.get(guestId, orderId);
	if (!guestExists) return json({ error: 'guest_not_found' }, { status: 400 });

	const order = loadOrder(orderId, locationId);
	broadcast('ORDER_UPDATED', { orderId, locationId });

	return json({ order, changeCents: change });
};
