import type Database from 'better-sqlite3';

export type ShiftExpense = {
	id: number;
	created_at: string;
	payment_method: 'cash' | 'cashless';
	amount_cents: number;
	comment: string | null;
};

const SQLITE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseExpenseTime(input: string | undefined): string | null {
	if (!input) return null;
	const m = SQLITE_DATETIME.exec(input.trim());
	if (!m) return null;
	const sec = m[6] ?? '00';
	return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${sec}`;
}

export function listExpensesForShift(db: Database.Database, shiftId: number): ShiftExpense[] {
	return db
		.prepare(
			`SELECT id, created_at, payment_method, amount_cents, comment
			 FROM expenses
			 WHERE shift_id = ?
			 ORDER BY created_at ASC, id ASC`
		)
		.all(shiftId) as ShiftExpense[];
}

export function expensesTotalForShift(db: Database.Database, shiftId: number): number {
	const row = db
		.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS n FROM expenses WHERE shift_id = ?`)
		.get(shiftId) as { n: number };
	return row.n;
}

export function getOpenShiftId(
	db: Database.Database,
	locationId: number,
	hallId: number
): number | null {
	const row = db
		.prepare(`SELECT id FROM shifts WHERE location_id = ? AND hall_id = ? AND status = 'open'`)
		.get(locationId, hallId) as { id: number } | undefined;
	return row?.id ?? null;
}

export function createExpense(
	db: Database.Database,
	opts: {
		locationId: number;
		hallId: number;
		userId: number;
		amountCents: number;
		paymentMethod: 'cash' | 'cashless';
		comment: string | null;
		createdAt: string | null;
	}
): { id: number } | { error: string } {
	const shiftId = getOpenShiftId(db, opts.locationId, opts.hallId);
	if (!shiftId) return { error: 'no_open_shift' };
	if (!Number.isInteger(opts.amountCents) || opts.amountCents <= 0) {
		return { error: 'invalid_amount' };
	}
	if (opts.paymentMethod !== 'cash' && opts.paymentMethod !== 'cashless') {
		return { error: 'invalid_method' };
	}

	const createdAt = opts.createdAt ?? null;
	const info = createdAt
		? db
				.prepare(
					`INSERT INTO expenses
					 (location_id, shift_id, user_id, payment_method, amount_cents, comment, created_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
				.run(
					opts.locationId,
					shiftId,
					opts.userId,
					opts.paymentMethod,
					opts.amountCents,
					opts.comment,
					createdAt
				)
		: db
				.prepare(
					`INSERT INTO expenses
					 (location_id, shift_id, user_id, payment_method, amount_cents, comment)
					 VALUES (?, ?, ?, ?, ?, ?)`
				)
				.run(
					opts.locationId,
					shiftId,
					opts.userId,
					opts.paymentMethod,
					opts.amountCents,
					opts.comment
				);

	return { id: Number(info.lastInsertRowid) };
}

export function deleteExpense(
	db: Database.Database,
	opts: { locationId: number; expenseId: number }
): { ok: true } | { error: string } {
	const row = db
		.prepare(
			`SELECT e.id, s.status
			 FROM expenses e
			 JOIN shifts s ON s.id = e.shift_id
			 WHERE e.id = ? AND e.location_id = ?`
		)
		.get(opts.expenseId, opts.locationId) as { id: number; status: string } | undefined;
	if (!row) return { error: 'not_found' };
	if (row.status !== 'open') return { error: 'shift_closed' };

	db.prepare(`DELETE FROM expenses WHERE id = ?`).run(opts.expenseId);
	return { ok: true };
}
