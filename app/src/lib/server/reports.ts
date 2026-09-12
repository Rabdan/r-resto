import type Database from 'better-sqlite3';
import { previousPeriod } from '$lib/period';

export type ProductAgg = { title: string; qty: number; amount_cents: number };

export type ProductCompare = {
	title: string;
	currentQty: number;
	currentCents: number;
	prevQty: number;
	prevCents: number;
	deltaPct: number | null;
};

const dateExpr = `COALESCE(DATE(o.closed_at), DATE(o.created_at))`;

export function productSales(
	db: Database.Database,
	locationId: number,
	from: string,
	to: string
): ProductAgg[] {
	return db
		.prepare(
			`SELECT oi.title AS title,
			        SUM(oi.quantity) AS qty,
			        SUM(oi.quantity * oi.price_cents) AS amount_cents
			 FROM order_items oi
			 JOIN orders o ON o.id = oi.order_id
			 WHERE o.location_id = ?
			   AND o.status = 'closed'
			   AND ${dateExpr} BETWEEN ? AND ?
			 GROUP BY oi.title
			 ORDER BY amount_cents DESC, title`
		)
		.all(locationId, from, to) as ProductAgg[];
}

export function compareProducts(
	db: Database.Database,
	locationId: number,
	from: string,
	to: string
): { previous: { from: string; to: string }; products: ProductCompare[] } {
	const previous = previousPeriod(from, to);
	const currentRows = productSales(db, locationId, from, to);
	const prevRows = productSales(db, locationId, previous.from, previous.to);
	const currentMap = new Map(currentRows.map((row) => [row.title, row]));
	const prevMap = new Map(prevRows.map((row) => [row.title, row]));
	const titles = new Set([...currentMap.keys(), ...prevMap.keys()]);
	const products: ProductCompare[] = [...titles].map((title) => {
		const current = currentMap.get(title);
		const prev = prevMap.get(title);
		const currentQty = current?.qty ?? 0;
		const currentCents = current?.amount_cents ?? 0;
		const prevQty = prev?.qty ?? 0;
		const prevCents = prev?.amount_cents ?? 0;
		let deltaPct: number | null = null;
		if (prevCents === 0) {
			deltaPct = currentCents > 0 ? 100 : null;
		} else {
			deltaPct = ((currentCents - prevCents) / prevCents) * 100;
		}
		return { title, currentQty, currentCents, prevQty, prevCents, deltaPct };
	});
	products.sort((a, b) => b.currentCents - a.currentCents || a.title.localeCompare(b.title, 'ru'));
	return { previous, products };
}

export type OrderReportRow = {
	id: number;
	created_at: string;
	closed_at: string | null;
	waiter_name: string;
	status: string;
	payment_method: string | null;
	total_cents: number;
};

export function ordersInRange(
	db: Database.Database,
	locationId: number,
	from: string,
	to: string
): OrderReportRow[] {
	return db
		.prepare(
			`SELECT o.id, o.created_at, o.closed_at, o.status, u.name AS waiter_name,
			        (SELECT og.payment_method FROM order_guests og
			         WHERE og.order_id = o.id AND og.is_paid = 1 LIMIT 1) AS payment_method,
			        COALESCE((
			          SELECT SUM(oi.quantity * oi.price_cents) FROM order_items oi WHERE oi.order_id = o.id
			        ), 0) AS total_cents
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 WHERE o.location_id = ?
			   AND o.status IN ('closed', 'cancelled')
			   AND DATE(o.created_at) BETWEEN ? AND ?
			 ORDER BY o.id DESC`
		)
		.all(locationId, from, to) as OrderReportRow[];
}

export type ExpenseRow = {
	id: number;
	created_at: string;
	payment_method: 'cash' | 'cashless';
	amount_cents: number;
	comment: string | null;
	author: string;
};

export function expensesInRange(
	db: Database.Database,
	locationId: number,
	from: string,
	to: string
): ExpenseRow[] {
	return db
		.prepare(
			`SELECT e.id, e.created_at, e.payment_method, e.amount_cents, e.comment, u.name AS author
			 FROM expenses e
			 JOIN users u ON u.id = e.user_id
			 WHERE e.location_id = ?
			   AND DATE(e.created_at) BETWEEN ? AND ?
			 ORDER BY e.id DESC`
		)
		.all(locationId, from, to) as ExpenseRow[];
}

export type HallSales = {
	name: string;
	qty: number;
	amount_cents: number;
	orders_count: number;
};

export function salesByHalls(
	db: Database.Database,
	locationId: number,
	from: string,
	to: string
): HallSales[] {
	return db
		.prepare(
			`SELECT h.name AS name,
			        SUM(oi.quantity) AS qty,
			        SUM(oi.quantity * oi.price_cents) AS amount_cents,
			        COUNT(DISTINCT o.id) AS orders_count
			 FROM orders o
			 JOIN halls h ON h.id = o.hall_id
			 JOIN order_items oi ON oi.order_id = o.id
			 WHERE o.location_id = ?
			   AND o.status = 'closed'
			   AND ${dateExpr} BETWEEN ? AND ?
			 GROUP BY h.id
			 ORDER BY amount_cents DESC`
		)
		.all(locationId, from, to) as HallSales[];
}

export type WaiterSales = {
	name: string;
	amount_cents: number;
	orders_count: number;
	avg_cents: number;
};

export function salesByWaiters(
	db: Database.Database,
	locationId: number,
	from: string,
	to: string
): WaiterSales[] {
	const rows = db
		.prepare(
			`SELECT u.name AS name,
			        SUM(oi.quantity * oi.price_cents) AS amount_cents,
			        COUNT(DISTINCT o.id) AS orders_count
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN order_items oi ON oi.order_id = o.id
			 WHERE o.location_id = ?
			   AND o.status = 'closed'
			   AND ${dateExpr} BETWEEN ? AND ?
			 GROUP BY u.id
			 ORDER BY amount_cents DESC`
		)
		.all(locationId, from, to) as Array<{
		name: string;
		amount_cents: number;
		orders_count: number;
	}>;
	return rows.map((row) => ({
		...row,
		avg_cents: row.orders_count > 0 ? Math.round(row.amount_cents / row.orders_count) : 0
	}));
}

export type PaymentSummary = {
	total_cents: number;
	cash_cents: number;
	cashless_cents: number;
	orders_count: number;
};

export function paymentSummary(
	db: Database.Database,
	locationId: number,
	from: string,
	to: string
): PaymentSummary {
	const row = db
		.prepare(
			`SELECT
				COALESCE(SUM(CASE WHEN og.payment_method = 'cash' THEN og.amount_cents ELSE 0 END), 0) AS cash_cents,
				COALESCE(SUM(CASE WHEN og.payment_method = 'cashless' THEN og.amount_cents ELSE 0 END), 0) AS cashless_cents,
				COUNT(DISTINCT o.id) AS orders_count
			 FROM order_guests og
			 JOIN orders o ON o.id = og.order_id
			 WHERE o.location_id = ?
			   AND o.status = 'closed'
			   AND og.is_paid = 1
			   AND ${dateExpr} BETWEEN ? AND ?`
		)
		.get(locationId, from, to) as {
		cash_cents: number;
		cashless_cents: number;
		orders_count: number;
	};
	return {
		total_cents: row.cash_cents + row.cashless_cents,
		cash_cents: row.cash_cents,
		cashless_cents: row.cashless_cents,
		orders_count: row.orders_count
	};
}

export type ShiftReportRow = {
	id: number;
	opened_at: string;
	closed_at: string | null;
	total_cents: number;
	cash_cents: number;
	cashless_cents: number;
	orders_count: number;
};

export function shiftsInRange(
	db: Database.Database,
	locationId: number,
	from: string,
	to: string
): ShiftReportRow[] {
	return db
		.prepare(
			`SELECT s.id, s.opened_at, s.closed_at,
			        COALESCE(z.total_cents, 0) AS total_cents,
			        COALESCE(z.cash_cents, 0) AS cash_cents,
			        COALESCE(z.cashless_cents, 0) AS cashless_cents,
			        COALESCE(z.orders_count, 0) AS orders_count
			 FROM shifts s
			 LEFT JOIN z_reports z ON z.shift_id = s.id
			 WHERE s.location_id = ?
			   AND s.status = 'closed'
			   AND DATE(s.closed_at) BETWEEN ? AND ?
			 ORDER BY s.id DESC`
		)
		.all(locationId, from, to) as ShiftReportRow[];
}
