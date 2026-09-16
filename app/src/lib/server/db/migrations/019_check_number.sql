-- Номер чека: отдельная сквозная нумерация закрытых чеков внутри смены,
-- начинается с 1 (как и номер заказа). Назначается при закрытии заказа.
ALTER TABLE orders ADD COLUMN check_number INTEGER NOT NULL DEFAULT 0;

-- Бэкофилл уже закрытых чеков: порядковый номер по времени закрытия в смене.
UPDATE orders SET check_number = (
	SELECT rn FROM (
		SELECT id, ROW_NUMBER() OVER (PARTITION BY shift_id ORDER BY closed_at, id) AS rn
		FROM orders WHERE status = 'closed'
	) t WHERE t.id = orders.id
) WHERE status = 'closed';
