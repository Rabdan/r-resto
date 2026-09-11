INSERT INTO locations (id, name, address) VALUES (1, 'Центр', NULL);

INSERT INTO halls (id, location_id, name, color_hex, sort_order) VALUES
	(1, 1, 'Главный зал', '#065F46', 0);

INSERT INTO users (id, name, role, is_active) VALUES
	(1, 'Администратор', 'admin', 1),
	(2, 'Иван', 'waiter', 1),
	(3, 'Алексей', 'kitchen', 1);

INSERT INTO user_locations (user_id, location_id) VALUES
	(1, 1),
	(2, 1),
	(3, 1);

INSERT INTO user_halls (user_id, hall_id) VALUES
	(2, 1);

INSERT INTO menu_categories (id, location_id, name, sort_order) VALUES
	(1, 1, 'Горячие', 0),
	(2, 1, 'Десерты', 1),
	(3, 1, 'Напитки', 2);

INSERT INTO menu_items (location_id, category_id, title, description, price_cents, is_available) VALUES
	(1, 1, 'Стейк Рибай', '', 120000, 1),
	(1, 1, 'Борщ Сибирский', '', 38000, 1),
	(1, 2, 'Рулет домашний', '', 27000, 1),
	(1, 3, 'Морс клюквенный', '', 15000, 1),
	(1, 3, 'Кола 0.5', '', 15000, 1);
