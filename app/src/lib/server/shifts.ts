import type Database from 'better-sqlite3';
import { expensesTotalForShift, listExpensesForShift, type ShiftExpense } from './expenses';

export type HallAgg = { name: string; cents: number };
export type WaiterAgg = { name: string; cents: number };

export type ZReport = {
	id: number;
	shift_id: number;
	total_cents: number;
	cash_cents: number;
	cashless_cents: number;
	orders_count: number;
	by_halls: HallAgg[];
	by_waiters: WaiterAgg[];
	created_at: string;
};

export type ShiftItem = { title: string; quantity: number; price_cents: number; status: string };
export type ShiftGuest = { name: string; is_paid: number };

export type OpenOrder = {
	id: number;
	created_at: string;
	waiter_name: string;
	hall_name: string;
	total_cents: number;
	items: ShiftItem[];
	guests: ShiftGuest[];
};

export type ClosedCheck = {
	id: number;
	created_at: string;
	closed_at: string | null;
	waiter_name: string;
	hall_name: string;
	total_cents: number;
};

export type CancelledOrder = {
	id: number;
	created_at: string;
	cancelled_at: string | null;
	cancel_reason: string | null;
	waiter_name: string;
	cancelled_by: string | null;
	total_cents: number;
};

export type ShiftRow = {
	id: number;
	opened_at: string;
	closed_at: string | null;
	status: string;
	opened_by: string | null;
	closed_by: string | null;
	z: ZReport | null;
	orders_count: number;
	cash_cents: number;
	cashless_cents: number;
	revenue_cents: number;
	expenses_cents: number;
	net_cents: number;
	expenses: ShiftExpense[];
	open: OpenOrder[];
	closed_checks: ClosedCheck[];
	cancelled: CancelledOrder[];
};

function shiftPayments(
	db: Database.Database,
	shiftId: number
): { cash_cents: number; cashless_cents: number } {
	return db
		.prepare(
			`SELECT
				COALESCE(SUM(CASE WHEN og.payment_method = 'cash' THEN og.amount_cents ELSE 0 END), 0) AS cash_cents,
				COALESCE(SUM(CASE WHEN og.payment_method = 'cashless' THEN og.amount_cents ELSE 0 END), 0) AS cashless_cents
			 FROM order_guests og
			 JOIN orders o ON o.id = og.order_id
			 WHERE o.shift_id = ? AND og.is_paid = 1`
		)
		.get(shiftId) as { cash_cents: number; cashless_cents: number };
}

function closedOrdersCount(db: Database.Database, shiftId: number): number {
	return (
		(
			db
				.prepare(`SELECT COUNT(*) AS n FROM orders WHERE shift_id = ? AND status = 'closed'`)
				.get(shiftId) as { n: number } | undefined
		)?.n ?? 0
	);
}

function openOrdersCount(db: Database.Database, shiftId: number): number {
	return (
		(
			db
				.prepare(`SELECT COUNT(*) AS n FROM orders WHERE shift_id = ? AND status = 'open'`)
				.get(shiftId) as { n: number } | undefined
		)?.n ?? 0
	);
}

export function loadOrdersForShift(
	db: Database.Database,
	locationId: number,
	shiftId: number
): { open: OpenOrder[]; closed_checks: ClosedCheck[]; cancelled: CancelledOrder[] } {
	const openRows = db
		.prepare(
			`SELECT o.id, o.created_at, u.name AS waiter_name, h.name AS hall_name,
			        COALESCE((
			          SELECT SUM(oi.quantity * oi.price_cents) FROM order_items oi WHERE oi.order_id = o.id
			        ), 0) AS total_cents
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.location_id = ? AND o.shift_id = ? AND o.status = 'open'
			 ORDER BY o.created_at ASC`
		)
		.all(locationId, shiftId) as Array<Omit<OpenOrder, 'items' | 'guests'>>;

	const itemsStmt = db.prepare(
		`SELECT title, quantity, price_cents, status FROM order_items WHERE order_id = ? ORDER BY id`
	);
	const guestsStmt = db.prepare(
		`SELECT name, is_paid FROM order_guests WHERE order_id = ? ORDER BY sort_order`
	);

	const open = openRows.map((row) => ({
		...row,
		items: itemsStmt.all(row.id) as ShiftItem[],
		guests: guestsStmt.all(row.id) as ShiftGuest[]
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
			 WHERE o.location_id = ? AND o.shift_id = ? AND o.status = 'cancelled'
			 ORDER BY o.cancelled_at DESC`
		)
		.all(locationId, shiftId) as CancelledOrder[];

	const closed_checks = db
		.prepare(
			`SELECT o.id, o.created_at, o.closed_at, u.name AS waiter_name, h.name AS hall_name,
			        COALESCE((
			          SELECT SUM(oi.quantity * oi.price_cents) FROM order_items oi WHERE oi.order_id = o.id
			        ), 0) AS total_cents
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN halls h ON h.id = o.hall_id
			 WHERE o.location_id = ? AND o.shift_id = ? AND o.status = 'closed'
			 ORDER BY o.closed_at DESC`
		)
		.all(locationId, shiftId) as ClosedCheck[];

	return { open, closed_checks, cancelled };
}

function buildZReport(
	db: Database.Database,
	shiftId: number
): Omit<ZReport, 'id' | 'shift_id' | 'created_at'> {
	const payments = shiftPayments(db, shiftId);
	const ordersCount = closedOrdersCount(db, shiftId);

	const byHalls = db
		.prepare(
			`SELECT h.name AS name, SUM(oi.quantity * oi.price_cents) AS cents
			 FROM orders o
			 JOIN halls h ON h.id = o.hall_id
			 JOIN order_items oi ON oi.order_id = o.id
			 WHERE o.shift_id = ? AND o.status = 'closed'
			 GROUP BY h.id
			 ORDER BY cents DESC`
		)
		.all(shiftId) as HallAgg[];

	const byWaiters = db
		.prepare(
			`SELECT u.name AS name, SUM(oi.quantity * oi.price_cents) AS cents
			 FROM orders o
			 JOIN users u ON u.id = o.waiter_id
			 JOIN order_items oi ON oi.order_id = o.id
			 WHERE o.shift_id = ? AND o.status = 'closed'
			 GROUP BY u.id
			 ORDER BY cents DESC`
		)
		.all(shiftId) as WaiterAgg[];

	return {
		total_cents: payments.cash_cents + payments.cashless_cents,
		cash_cents: payments.cash_cents,
		cashless_cents: payments.cashless_cents,
		orders_count: ordersCount,
		by_halls: byHalls,
		by_waiters: byWaiters
	};
}

export function listShifts(db: Database.Database, locationId: number): ShiftRow[] {
	const shifts = db
		.prepare(
			`SELECT s.id, s.opened_at, s.closed_at, s.status,
			        ou.name AS opened_by, cu.name AS closed_by
			 FROM shifts s
			 LEFT JOIN users ou ON ou.id = s.opened_by_user_id
			 LEFT JOIN users cu ON cu.id = s.closed_by_user_id
			 WHERE s.location_id = ?
			 ORDER BY s.id DESC
			 LIMIT 50`
		)
		.all(locationId) as Array<
		Pick<ShiftRow, 'id' | 'opened_at' | 'closed_at' | 'status' | 'opened_by' | 'closed_by'>
	>;

	const zStmt = db.prepare(
		`SELECT id, shift_id, total_cents, cash_cents, cashless_cents, orders_count, by_halls_json, by_waiters_json, created_at
		 FROM z_reports WHERE shift_id = ?`
	);

	return shifts.map((s) => {
		const zr = zStmt.get(s.id) as
			| {
					id: number;
					shift_id: number;
					total_cents: number;
					cash_cents: number;
					cashless_cents: number;
					orders_count: number;
					by_halls_json: string | null;
					by_waiters_json: string | null;
					created_at: string;
			  }
			| undefined;
		const z: ZReport | null = zr
			? {
					id: zr.id,
					shift_id: zr.shift_id,
					total_cents: zr.total_cents,
					cash_cents: zr.cash_cents,
					cashless_cents: zr.cashless_cents,
					orders_count: zr.orders_count,
					by_halls: JSON.parse(zr.by_halls_json ?? '[]'),
					by_waiters: JSON.parse(zr.by_waiters_json ?? '[]'),
					created_at: zr.created_at
				}
			: null;

		const payments = shiftPayments(db, s.id);
		const revenue_cents = payments.cash_cents + payments.cashless_cents;
		const expenses = listExpensesForShift(db, s.id);
		const expenses_cents = expensesTotalForShift(db, s.id);
		const shiftOrders =
			s.status === 'open'
				? loadOrdersForShift(db, locationId, s.id)
				: { open: [], closed_checks: [], cancelled: [] };

		return {
			id: s.id,
			opened_at: s.opened_at,
			closed_at: s.closed_at,
			status: s.status,
			opened_by: s.opened_by,
			closed_by: s.closed_by,
			z,
			orders_count: closedOrdersCount(db, s.id),
			cash_cents: payments.cash_cents,
			cashless_cents: payments.cashless_cents,
			revenue_cents,
			expenses_cents,
			net_cents: revenue_cents - expenses_cents,
			expenses,
			open: shiftOrders.open,
			closed_checks: shiftOrders.closed_checks,
			cancelled: shiftOrders.cancelled
		};
	});
}

export function getZReport(db: Database.Database, locationId: number, shiftId: number): ZReport | null {
	return listShifts(db, locationId).find((s) => s.id === shiftId)?.z ?? null;
}

export function closeOpenShift(
	db: Database.Database,
	locationId: number,
	userId: number
): { shiftId: number; z: Omit<ZReport, 'shift_id' | 'created_at'> } | { error: string } {
	const shift = db
		.prepare(`SELECT id FROM shifts WHERE location_id = ? AND status = 'open'`)
		.get(locationId) as { id: number } | undefined;
	if (!shift) return { error: 'no_open_shift' };

	if (openOrdersCount(db, shift.id) > 0) return { error: 'open_orders' };

	const z = buildZReport(db, shift.id);
	const zId = db.transaction(() => {
		db.prepare(
			`UPDATE shifts SET status = 'closed', closed_at = datetime('now'), closed_by_user_id = ? WHERE id = ?`
		).run(userId, shift.id);
		const info = db
			.prepare(
				`INSERT INTO z_reports
				 (shift_id, location_id, total_cents, cash_cents, cashless_cents, orders_count, by_halls_json, by_waiters_json, closed_by_user_id)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				shift.id,
				locationId,
				z.total_cents,
				z.cash_cents,
				z.cashless_cents,
				z.orders_count,
				JSON.stringify(z.by_halls),
				JSON.stringify(z.by_waiters),
				userId
			);
		return Number(info.lastInsertRowid);
	})();

	return { shiftId: shift.id, z: { ...z, id: zId } };
}
