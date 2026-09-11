ALTER TABLE devices ADD COLUMN blocked_at TEXT;
ALTER TABLE menu_categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE halls ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE halls ADD COLUMN closed_at TEXT;

CREATE TABLE z_reports (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	shift_id INTEGER NOT NULL UNIQUE REFERENCES shifts(id),
	location_id INTEGER NOT NULL,
	total_cents INTEGER NOT NULL,
	cash_cents INTEGER NOT NULL,
	cashless_cents INTEGER NOT NULL,
	orders_count INTEGER NOT NULL,
	by_halls_json TEXT,
	by_waiters_json TEXT,
	closed_by_user_id INTEGER REFERENCES users(id),
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_z_reports_location ON z_reports(location_id);
