import { db } from './db';
import { broadcast } from './sse';

export type OrderRow = {
	id: number;
	location_id: number;
	hall_id: number;
	waiter_id: number;
	status: string;
	total_amount_cents: number;
};

export type PrecheckItem = {
	id: number;
	guest_id: number;
	menu_item_id: number | null;
	title: string;
	price_cents: number;
	quantity: number;
	status: string;
	is_custom: number;
};

export type PrecheckGuest = {
	id: number;
	name: string;
	sort_order: number;
	is_paid: number;
	payment_method: string | null;
	amount_cents: number;
};

export function waiterLocationId(locals: App.Locals): number | null {
	if (locals.device?.status !== 'active' || locals.device.role !== 'waiter') return null;
	return locals.device.locationId;
}

export function getOpenOrder(orderId: number, locationId: number): OrderRow | null {
	const row = db
		.prepare(
			`SELECT id, location_id, hall_id, waiter_id, status, total_amount_cents
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

export function loadPrecheck(orderId: number, locationId: number) {
	const order = db
		.prepare(
			`SELECT o.id, o.status, o.total_amount_cents, o.created_at,
			        h.name AS hall_name, h.color_hex AS hall_color
			 FROM orders o
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.id = ? AND o.location_id = ?`
		)
		.get(orderId, locationId) as
		| {
				id: number;
				status: string;
				total_amount_cents: number;
				created_at: string;
				hall_name: string;
				hall_color: string;
		  }
		| undefined;
	if (!order) return null;

	const guests = db
		.prepare(
			`SELECT id, name, sort_order, is_paid, payment_method, amount_cents
			 FROM order_guests WHERE order_id = ? ORDER BY sort_order, id`
		)
		.all(orderId) as PrecheckGuest[];
	const items = db
		.prepare(
			`SELECT id, guest_id, menu_item_id, title, price_cents, quantity, status, is_custom
			 FROM order_items WHERE order_id = ? ORDER BY id`
		)
		.all(orderId) as PrecheckItem[];

	return { ...order, guests, items };
}

export function notifyOrder(orderId: number, locationId: number): void {
	broadcast('PRECHECK_UPDATED', { orderId, locationId });
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

export function mergeOrInsertHeld(opts: {
	orderId: number;
	guestId: number;
	menuItemId: number | null;
	title: string;
	priceCents: number;
	quantity: number;
	isCustom: boolean;
}): void {
	const existing = opts.isCustom
		? (db
				.prepare(
					`SELECT id, quantity FROM order_items
					 WHERE order_id = ? AND guest_id = ? AND status = 'held' AND is_custom = 1
					   AND title = ? AND price_cents = ?`
				)
				.get(opts.orderId, opts.guestId, opts.title, opts.priceCents) as
				| { id: number; quantity: number }
				| undefined)
		: (db
				.prepare(
					`SELECT id, quantity FROM order_items
					 WHERE order_id = ? AND guest_id = ? AND status = 'held' AND menu_item_id = ?`
				)
				.get(opts.orderId, opts.guestId, opts.menuItemId) as
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
		`INSERT INTO order_items (order_id, guest_id, menu_item_id, title, price_cents, quantity, status, is_custom)
		 VALUES (@orderId, @guestId, @menuItemId, @title, @priceCents, @quantity, 'held', @isCustom)`
	).run({
		orderId: opts.orderId,
		guestId: opts.guestId,
		menuItemId: opts.menuItemId,
		title: opts.title,
		priceCents: opts.priceCents,
		quantity: opts.quantity,
		isCustom: opts.isCustom ? 1 : 0
	});
}
