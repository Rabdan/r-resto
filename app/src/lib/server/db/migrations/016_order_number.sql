-- Номер чека/заказа внутри смены: нумерация начинается с 1 в каждой смене.
ALTER TABLE orders ADD COLUMN number INTEGER NOT NULL DEFAULT 0;

-- Бэкофилл уже существующих заказов: сквозной порядковый номер по shift_id.
UPDATE orders SET number = (
	SELECT rn FROM (
		SELECT id, ROW_NUMBER() OVER (PARTITION BY shift_id ORDER BY id) AS rn
		FROM orders
	) t WHERE t.id = orders.id
);
