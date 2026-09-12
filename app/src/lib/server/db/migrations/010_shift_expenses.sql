DROP TABLE IF EXISTS expenses;

CREATE TABLE expenses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	location_id INTEGER NOT NULL REFERENCES locations(id) NOT NULL,
	shift_id INTEGER NOT NULL REFERENCES shifts(id) NOT NULL,
	user_id INTEGER NOT NULL REFERENCES users(id) NOT NULL,
	payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'cashless')),
	amount_cents INTEGER NOT NULL,
	comment TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_expenses_shift ON expenses(shift_id);
CREATE INDEX idx_expenses_location_created ON expenses(location_id, created_at);
