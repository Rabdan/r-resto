import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const openRows = db
		.prepare(
			`SELECT o.id, o.created_at, u.name AS waiter_name, h.name AS hall_name,
			        COALESCE((
			          SELECT SUM(oi.quantity * oi.price_cents) FROM order_items oi WHERE oi.order_id = o.id
			        ), 0) AS total_cents
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.location_id = ? AND o.status = 'open'
			 ORDER BY o.created_at ASC`
		)
		.all(locationId) as Array<{
		id: number;
		created_at: string;
		waiter_name: string;
		hall_name: string;
		total_cents: number;
	}>;

	const itemsStmt = db.prepare(
		`SELECT title, quantity, price_cents, status FROM order_items WHERE order_id = ? ORDER BY id`
	);
	const guestsStmt = db.prepare(
		`SELECT name, is_paid FROM order_guests WHERE order_id = ? ORDER BY sort_order`
	);

	const open = openRows.map((row) => ({
		...row,
		items: itemsStmt.all(row.id) as Array<{
			title: string;
			quantity: number;
			price_cents: number;
			status: string;
		}>,
		guests: guestsStmt.all(row.id) as Array<{ name: string; is_paid: number }>
	}));

	const cancelled = db
		.prepare(
			`SELECT o.id, o.created_at, o.cancelled_at, o.cancel_reason, u.name AS waiter_name,
			        a.name AS cancelled_by,
			        COALESCE((
			          SELECT SUM(oi.quantity * oi.price_cents) FROM order_items oi WHERE oi.order_id = o.id
			        ), 0) AS total_cents
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 LEFT JOIN users a ON a.id = o.cancelled_by_user_id
			 WHERE o.location_id = ? AND o.status = 'cancelled'
			 ORDER BY o.cancelled_at DESC
			 LIMIT 30`
		)
		.all(locationId);

	const closed = db
		.prepare(
			`SELECT o.id, o.created_at, o.closed_at, u.name AS waiter_name, h.name AS hall_name,
			        COALESCE((
			          SELECT SUM(oi.quantity * oi.price_cents) FROM order_items oi WHERE oi.order_id = o.id
			        ), 0) AS total_cents
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.location_id = ? AND o.status = 'closed'
			 ORDER BY o.closed_at DESC
			 LIMIT 100`
		)
		.all(locationId) as Array<{
		id: number;
		created_at: string;
		closed_at: string | null;
		waiter_name: string;
		hall_name: string;
		total_cents: number;
	}>;

	return json({ open, closed, cancelled });
};
