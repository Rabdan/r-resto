import { db } from './db';
import { broadcast } from './sse';
import { deviceHasRole } from '$lib/types';

export type OrderRow = {
	id: number;
	number: number;
	location_id: number;
	hall_id: number;
	waiter_id: number;
	status: string;
	total_amount_cents: number;
};

export type OrderItem = {
	id: number;
	guest_id: number;
	menu_item_id: number | null;
	title: string;
	price_cents: number;
	quantity: number;
	status: string;
	is_custom: number;
	ready_at: string | null;
};

export type OrderGuest = {
	id: number;
	name: string;
	sort_order: number;
	is_paid: number;
	payment_method: string | null;
	amount_cents: number;
	cash_cents: number;
	cashless_cents: number;
	shortfall_cents: number;
	writeoff_cents: number;
};

export function waiterLocationId(locals: App.Locals): number | null {
	if (locals.device?.status !== 'active' || !deviceHasRole(locals.device, 'waiter')) return null;
	return locals.device.locationId;
}

export function getOpenOrder(orderId: number, locationId: number): OrderRow | null {
	const row = db
		.prepare(
			`SELECT id, number, location_id, hall_id, waiter_id, status, total_amount_cents
			 FROM orders WHERE id = ? AND location_id = ?`
		)
		.get(orderId, locationId) as OrderRow | undefined;
	return row ?? null;
}

export function refreshOrderTotal(orderId: number): void {
	db.prepare(
		`UPDATE orders SET total_amount_cents = COALESCE(
			(SELECT SUM(quantity * price_cents) FROM order_items WHERE order_id = ?),
			0
		) WHERE id = ?`
	).run(orderId, orderId);
}

export function loadOrder(orderId: number, locationId: number) {
	const order = db
		.prepare(
			`SELECT o.id, o.number, o.status, o.total_amount_cents, o.created_at, o.hall_id,
			        h.name AS hall_name, h.color_hex AS hall_color, h.qr_image_path
			 FROM orders o
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.id = ? AND o.location_id = ?`
		)
		.get(orderId, locationId) as
		| {
				id: number;
				number: number;
				status: string;
				total_amount_cents: number;
				created_at: string;
				hall_id: number;
				hall_name: string;
				hall_color: string;
				qr_image_path: string | null;
		  }
		| undefined;
	if (!order) return null;

	const guests = db
		.prepare(
			`SELECT id, name, sort_order, is_paid, payment_method, amount_cents,
			        cash_cents, cashless_cents, shortfall_cents, writeoff_cents
			 FROM order_guests WHERE order_id = ? ORDER BY sort_order, id`
		)
		.all(orderId) as OrderGuest[];
	const items = db
		.prepare(
			`SELECT id, guest_id, menu_item_id, title, price_cents, quantity, status, is_custom, ready_at
			 FROM order_items WHERE order_id = ? ORDER BY id`
		)
		.all(orderId) as OrderItem[];

	return { ...order, guests, items };
}

export function notifyOrder(orderId: number, locationId: number): void {
	broadcast('ORDER_UPDATED', { orderId, locationId });
}

export function guestItemsTotal(orderId: number, guestId: number): number {
	const row = db
		.prepare(
			`SELECT COALESCE(SUM(quantity * price_cents), 0) AS total
			 FROM order_items WHERE order_id = ? AND guest_id = ?`
		)
		.get(orderId, guestId) as { total: number };
	return row.total;
}

/** Пустые неоплаченные гости не должны блокировать закрытие заказа. */
export function settleEmptyUnpaidGuests(orderId: number): void {
	const guests = db
		.prepare(`SELECT id FROM order_guests WHERE order_id = ? AND is_paid = 0`)
		.all(orderId) as Array<{ id: number }>;
	const mark = db.prepare(
		`UPDATE order_guests
		 SET is_paid = 1, amount_cents = 0, paid_at = datetime('now')
		 WHERE id = ? AND is_paid = 0`
	);
	for (const guest of guests) {
		if (guestItemsTotal(orderId, guest.id) <= 0) mark.run(guest.id);
	}
}

export function mergeOrInsertHeld(opts: {
	orderId: number;
	guestId: number;
	menuItemId: number | null;
	title: string;
	priceCents: number;
	quantity: number;
	isCustom: boolean;
	status?: string;
	sentAt?: string | null;
	readyAt?: string | null;
}): void {
	const status = opts.status ?? 'held';
	const existing = opts.isCustom
		? (db
				.prepare(
					`SELECT id, quantity FROM order_items
					 WHERE order_id = ? AND guest_id = ? AND status = ? AND is_custom = 1
					   AND title = ? AND price_cents = ?`
				)
				.get(opts.orderId, opts.guestId, status, opts.title, opts.priceCents) as
				| { id: number; quantity: number }
				| undefined)
		: (db
				.prepare(
					`SELECT id, quantity FROM order_items
					 WHERE order_id = ? AND guest_id = ? AND status = ? AND menu_item_id = ?`
				)
				.get(opts.orderId, opts.guestId, status, opts.menuItemId) as
				| { id: number; quantity: number }
				| undefined);

	if (existing) {
		db.prepare(`UPDATE order_items SET quantity = quantity + ? WHERE id = ?`).run(
			opts.quantity,
			existing.id
		);
		return;
	}

	db.prepare(
		`INSERT INTO order_items (order_id, guest_id, menu_item_id, title, price_cents, quantity, status, is_custom, sent_at, ready_at)
		 VALUES (@orderId, @guestId, @menuItemId, @title, @priceCents, @quantity, @status, @isCustom, @sentAt, @readyAt)`
	).run({
		orderId: opts.orderId,
		guestId: opts.guestId,
		menuItemId: opts.menuItemId,
		title: opts.title,
		priceCents: opts.priceCents,
		quantity: opts.quantity,
		status,
		isCustom: opts.isCustom ? 1 : 0,
		sentAt: opts.sentAt ?? null,
		readyAt: opts.readyAt ?? null
	});
}
