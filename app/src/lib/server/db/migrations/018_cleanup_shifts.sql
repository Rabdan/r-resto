-- Очистка тестовых смен 1 и 2, перенос ранних смен на главный зал,
-- и жёсткое требование: смена всегда принадлежит залу (hall_id NOT NULL).
-- FK выключены во время миграций, поэтому зависимые строки удаляем явно.

DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shift_id IN (1, 2));
DELETE FROM order_guests WHERE order_id IN (SELECT id FROM orders WHERE shift_id IN (1, 2));
DELETE FROM orders WHERE shift_id IN (1, 2);
DELETE FROM z_reports WHERE shift_id IN (1, 2);
DELETE FROM expenses WHERE shift_id IN (1, 2);
DELETE FROM shifts WHERE id IN (1, 2);

-- Ранние смены без зала — на главный зал своей локации.
UPDATE shifts SET hall_id = (
	SELECT h.id FROM halls h
	WHERE h.location_id = shifts.location_id AND h.is_active = 1
	ORDER BY h.sort_order, h.id
	LIMIT 1
) WHERE hall_id IS NULL;

-- Пересоздаём shifts с hall_id NOT NULL (смена обязана принадлежать залу).
CREATE TABLE shifts_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	location_id INTEGER NOT NULL REFERENCES locations(id) NOT NULL,
	hall_id INTEGER NOT NULL REFERENCES halls(id),
	opened_by_user_id INTEGER NOT NULL REFERENCES users(id),
	closed_by_user_id INTEGER REFERENCES users(id),
	opened_at TEXT NOT NULL DEFAULT (datetime('now')),
	closed_at TEXT,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

INSERT INTO shifts_new
	(id, location_id, hall_id, opened_by_user_id, closed_by_user_id, opened_at, closed_at, status)
SELECT id, location_id, hall_id, opened_by_user_id, closed_by_user_id, opened_at, closed_at, status
FROM shifts;

DROP TABLE shifts;
ALTER TABLE shifts_new RENAME TO shifts;

CREATE INDEX idx_shifts_location_status ON shifts(location_id, status);
CREATE UNIQUE INDEX idx_shifts_open_hall ON shifts(location_id, hall_id) WHERE status = 'open';
