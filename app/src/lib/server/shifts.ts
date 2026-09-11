import type Database from 'better-sqlite3';

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

export type ShiftRow = {
	id: number;
	opened_at: string;
	closed_at: string | null;
	status: string;
	opened_by: string | null;
	closed_by: string | null;
	z: ZReport | null;
};

function buildZReport(
	db: Database.Database,
	shiftId: number
): Omit<ZReport, 'id' | 'shift_id' | 'created_at'> {
	const payments = db
		.prepare(
			`SELECT
				COALESCE(SUM(CASE WHEN og.payment_method = 'cash' THEN og.amount_cents ELSE 0 END), 0) AS cash_cents,
				COALESCE(SUM(CASE WHEN og.payment_method = 'cashless' THEN og.amount_cents ELSE 0 END), 0) AS cashless_cents
			 FROM order_guests og
			 JOIN orders o ON o.id = og.order_id
			 WHERE o.shift_id = ? AND og.is_paid = 1`
		)
		.get(shiftId) as { cash_cents: number; cashless_cents: number };

	const ordersCount = (
		db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE shift_id = ? AND status = 'closed'`).get(shiftId) as
			| { n: number }
			| undefined
	)?.n ?? 0;

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
		.all(locationId) as Array<Omit<ShiftRow, 'z'>>;

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
		return { id: s.id, opened_at: s.opened_at, closed_at: s.closed_at, status: s.status, opened_by: s.opened_by, closed_by: s.closed_by, z };
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
