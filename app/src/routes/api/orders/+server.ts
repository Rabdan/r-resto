import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';
import { loadPrecheck } from '$lib/server/orders';
import type { RequestHandler } from './$types';

function requireWaiter(locals: App.Locals) {
	if (locals.device?.status !== 'active' || locals.device.role !== 'waiter') {
		return false;
	}
	return true;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!requireWaiter(locals)) return json({ error: 'forbidden' }, { status: 403 });

	const locationId = locals.device!.locationId;
	const tab = url.searchParams.get('tab') === 'closed' ? 'closed' : 'open';

	if (tab === 'closed') {
		const shift = db
			.prepare(
				`SELECT id FROM shifts WHERE location_id = ? AND status = 'open'
				 UNION ALL
				 SELECT id FROM shifts WHERE location_id = ? AND status = 'closed'
				 ORDER BY id DESC LIMIT 1`
			)
			.get(locationId, locationId) as { id: number } | undefined;

		if (!shift) return json({ orders: [] });

		const rows = db
			.prepare(
				`SELECT o.id, o.created_at, o.closed_at, o.total_amount_cents, o.hall_id,
				        u.name AS waiter_name, h.name AS hall_name
				 FROM orders o
				 JOIN users u ON u.id = o.waiter_id
				 JOIN halls h ON h.id = o.hall_id
				 WHERE o.location_id = ? AND o.status = 'closed' AND o.shift_id = ?
				 ORDER BY o.closed_at DESC, o.id DESC`
			)
			.all(locationId, shift.id) as Array<{
			id: number;
			created_at: string;
			closed_at: string | null;
			total_amount_cents: number;
			hall_id: number;
			waiter_name: string;
			hall_name: string;
		}>;

		const guestsStmt = db.prepare(
			`SELECT name, payment_method FROM order_guests WHERE order_id = ? ORDER BY sort_order, id`
		);
		const orders = rows.map((row) => ({
			...row,
			guests: guestsStmt.all(row.id) as Array<{ name: string; payment_method: string | null }>
		}));
		return json({ orders });
	}

	const rows = db
		.prepare(
			`SELECT o.id, o.status, o.total_amount_cents, o.created_at, o.hall_id,
			        u.name AS waiter_name, h.name AS hall_name
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.location_id = ? AND o.status = 'open'
			 ORDER BY o.id DESC`
		)
		.all(locationId) as Array<{
		id: number;
		status: string;
		total_amount_cents: number;
		created_at: string;
		hall_id: number;
		waiter_name: string;
		hall_name: string;
	}>;

	const guestsStmt = db.prepare(
		`SELECT name FROM order_guests WHERE order_id = ? ORDER BY sort_order, id`
	);
	const orders = rows.map((row) => ({
		...row,
		guests: guestsStmt.all(row.id) as Array<{ name: string }>
	}));

	return json({ orders });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!requireWaiter(locals)) return json({ error: 'forbidden' }, { status: 403 });

	const locationId = locals.device!.locationId;
	const waiterId = locals.device!.userId;
	if (!locationId || !waiterId) return json({ error: 'device not assigned' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as {
		hallId?: number;
		guests?: string[];
		items?: Array<{
			guestIndex?: number;
			menuItemId?: number;
			title?: string;
			priceCents?: number;
			quantity?: number;
		}>;
		fired?: boolean;
		pay?: { guestIndex?: number; method?: 'cash' | 'cashless'; cashReceivedCents?: number };
	};

	const hall =
		(body.hallId
			? (db.prepare(`SELECT id FROM halls WHERE id = ? AND location_id = ? AND is_active = 1`).get(body.hallId, locationId) as
					| { id: number }
					| undefined)
			: (db.prepare(`SELECT id FROM halls WHERE location_id = ? AND is_active = 1 ORDER BY sort_order LIMIT 1`).get(locationId) as
					| { id: number }
					| undefined));

	if (!hall) return json({ error: 'hall not found' }, { status: 400 });

	const shift = db
		.prepare(`SELECT id FROM shifts WHERE location_id = ? AND status = 'open'`)
		.get(locationId) as { id: number } | undefined;

	if (!shift) {
		return json({ error: 'shift_closed', message: 'Смена закрыта' }, { status: 409 });
	}

	const guestNames = (body.guests ?? []).map((n) => String(n ?? '').trim() || 'Гость');
	const fired = body.fired === true;

	const sentAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

	type ResolvedItem = {
		guestIndex: number;
		menuItemId: number | null;
		title: string;
		priceCents: number;
		quantity: number;
		isCustom: number;
	};
	const resolvedItems: ResolvedItem[] = [];
	for (const raw of body.items ?? []) {
		const guestIndex = Math.max(0, Math.floor(Number(raw.guestIndex) || 0));
		const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
		if (raw.menuItemId) {
			const menu = db
				.prepare(
					`SELECT id, title, price_cents, is_available FROM menu_items
					 WHERE id = ? AND location_id = ? AND is_active = 1`
				)
				.get(Number(raw.menuItemId), locationId) as
				| { id: number; title: string; price_cents: number; is_available: number }
				| undefined;
			if (!menu || !menu.is_available) continue;
			resolvedItems.push({
				guestIndex,
				menuItemId: menu.id,
				title: menu.title,
				priceCents: menu.price_cents,
				quantity,
				isCustom: 0
			});
		} else {
			const title = (raw.title ?? '').trim();
			const priceCents = Math.round(Number(raw.priceCents));
			if (!title || !Number.isFinite(priceCents) || priceCents < 0) continue;
			resolvedItems.push({ guestIndex, menuItemId: null, title, priceCents, quantity, isCustom: 1 });
		}
	}

	let payMethod: 'cash' | 'cashless' | null = null;
	let payGuestIndex = 0;
	let payAmount = 0;
	let cashReceived: number | null = null;
	let changeCents = 0;
	if (body.pay) {
		payGuestIndex = Math.max(0, Math.floor(Number(body.pay.guestIndex) || 0));
		payMethod = body.pay.method === 'cash' ? 'cash' : 'cashless';
		payAmount = resolvedItems
			.filter((i) => i.guestIndex === payGuestIndex)
			.reduce((sum, i) => sum + i.quantity * i.priceCents, 0);
		if (payAmount <= 0) return json({ error: 'empty_guest' }, { status: 409 });
		if (payMethod === 'cash') {
			cashReceived = Math.round(Number(body.pay.cashReceivedCents));
			if (!Number.isFinite(cashReceived) || cashReceived < payAmount) {
				return json({ error: 'cash_too_low' }, { status: 400 });
			}
			changeCents = cashReceived - payAmount;
		}
	}

	const result = db.transaction(() => {
		const info = db
			.prepare(
				`INSERT INTO orders (location_id, hall_id, shift_id, waiter_id, status)
				 VALUES (@locationId, @hallId, @shiftId, @waiterId, 'open')`
			)
			.run({ locationId, hallId: hall.id, shiftId: shift.id, waiterId });
		const id = Number(info.lastInsertRowid);

		const guestIds: number[] = [];
		const insGuest = db.prepare(
			`INSERT INTO order_guests (order_id, name, sort_order) VALUES (?, ?, ?)`
		);
		if (guestNames.length > 0) {
			guestNames.forEach((name, i) => {
				guestIds.push(Number(insGuest.run(id, name, i).lastInsertRowid));
			});
		} else {
			guestIds.push(Number(insGuest.run(id, 'Гость 1', 0).lastInsertRowid));
		}

		const insItem = db.prepare(
			`INSERT INTO order_items (order_id, guest_id, menu_item_id, title, price_cents, quantity, status, is_custom, sent_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		);
		for (const item of resolvedItems) {
			const guestId = guestIds[Math.min(item.guestIndex, guestIds.length - 1)];
			insItem.run(
				id,
				guestId,
				item.menuItemId,
				item.title,
				item.priceCents,
				item.quantity,
				fired ? 'pending' : 'held',
				item.isCustom,
				fired ? sentAt : null
			);
		}

		db.prepare(
			`UPDATE orders SET total_amount_cents = COALESCE(
				(SELECT SUM(quantity * price_cents) FROM order_items WHERE order_id = ?), 0
			) WHERE id = ?`
		).run(id, id);

		if (payMethod) {
			const payGuestId = guestIds[Math.min(payGuestIndex, guestIds.length - 1)];
			db.prepare(
				`UPDATE order_guests
				 SET is_paid = 1, payment_method = ?, amount_cents = ?, cash_received_cents = ?, change_cents = ?, paid_at = datetime('now')
				 WHERE id = ?`
			).run(payMethod, payAmount, cashReceived, payMethod === 'cash' ? changeCents : 0, payGuestId);

			const unpaid = db
				.prepare(`SELECT COUNT(*) AS n FROM order_guests WHERE order_id = ? AND is_paid = 0`)
				.get(id) as { n: number };
			if (unpaid.n === 0) {
				db.prepare(
					`UPDATE orders SET status = 'closed', closed_at = datetime('now') WHERE id = ?`
				).run(id);
			}
		}

		return { id, changeCents };
	})();

	broadcast('PRECHECK_CREATED', { orderId: result.id, locationId });
	const precheck = loadPrecheck(result.id, locationId);
	if (precheck?.status === 'closed') {
		broadcast('PRECHECK_CLOSED', { orderId: result.id, locationId });
	}

	return json({ id: result.id, precheck, changeCents: result.changeCents }, { status: 201 });
};
