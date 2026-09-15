-- Частичная/смешанная оплата (нал + безнал) и недоплата.
-- order_guests пересобирается: добавляются суммы по способам и недоплата,
-- payment_method допускает 'mixed'. FK-ссылки из order_items остаются валидными,
-- т.к. итоговое имя таблицы не меняется (DROP + CREATE под тем же именем).

CREATE TABLE order_guests_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	sort_order INTEGER NOT NULL DEFAULT 0,
	is_paid INTEGER NOT NULL DEFAULT 0,
	payment_method TEXT CHECK (payment_method IN ('cash', 'cashless', 'mixed')),
	amount_cents INTEGER NOT NULL DEFAULT 0,
	cash_received_cents INTEGER,
	change_cents INTEGER,
	paid_at TEXT,
	cash_cents INTEGER NOT NULL DEFAULT 0,
	cashless_cents INTEGER NOT NULL DEFAULT 0,
	shortfall_cents INTEGER NOT NULL DEFAULT 0,
	writeoff_cents INTEGER NOT NULL DEFAULT 0,
	writeoff_reason TEXT
);

INSERT INTO order_guests_new
	(id, order_id, name, sort_order, is_paid, payment_method, amount_cents,
	 cash_received_cents, change_cents, paid_at, cash_cents, cashless_cents)
SELECT id, order_id, name, sort_order, is_paid, payment_method, amount_cents,
       cash_received_cents, change_cents, paid_at,
       CASE WHEN payment_method = 'cash' THEN amount_cents ELSE 0 END,
       CASE WHEN payment_method = 'cashless' THEN amount_cents ELSE 0 END
FROM order_guests;

DROP TABLE order_guests;
ALTER TABLE order_guests_new RENAME TO order_guests;

CREATE INDEX idx_order_guests_order ON order_guests(order_id);

ALTER TABLE z_reports ADD COLUMN writeoff_cents INTEGER NOT NULL DEFAULT 0;
