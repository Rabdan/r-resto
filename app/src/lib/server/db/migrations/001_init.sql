CREATE TABLE locations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	address TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE halls (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	color_hex TEXT NOT NULL DEFAULT '#0F172A',
	sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('waiter', 'kitchen', 'admin')),
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_locations (
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
	PRIMARY KEY (user_id, location_id)
);

CREATE TABLE user_halls (
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	hall_id INTEGER NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
	PRIMARY KEY (user_id, hall_id)
);

CREATE TABLE devices (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	device_code TEXT NOT NULL UNIQUE,
	device_uuid TEXT NOT NULL UNIQUE,
	device_name TEXT,
	location_id INTEGER REFERENCES locations(id),
	assigned_user_id INTEGER REFERENCES users(id),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'terminated')),
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE menu_categories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
	category_id INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	price_cents INTEGER NOT NULL,
	image_path TEXT,
	is_available INTEGER NOT NULL DEFAULT 1,
	is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE shifts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	location_id INTEGER NOT NULL REFERENCES locations(id) NOT NULL,
	opened_by_user_id INTEGER NOT NULL REFERENCES users(id),
	closed_by_user_id INTEGER REFERENCES users(id),
	opened_at TEXT NOT NULL DEFAULT (datetime('now')),
	closed_at TEXT,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

CREATE TABLE orders (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	location_id INTEGER NOT NULL REFERENCES locations(id) NOT NULL,
	hall_id INTEGER NOT NULL REFERENCES halls(id) NOT NULL,
	shift_id INTEGER NOT NULL REFERENCES shifts(id) NOT NULL,
	waiter_id INTEGER NOT NULL REFERENCES users(id) NOT NULL,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
	total_amount_cents INTEGER NOT NULL DEFAULT 0,
	cancel_reason TEXT,
	cancelled_by_user_id INTEGER REFERENCES users(id),
	cancelled_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	closed_at TEXT
);

CREATE TABLE order_guests (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	sort_order INTEGER NOT NULL DEFAULT 0,
	is_paid INTEGER NOT NULL DEFAULT 0,
	payment_method TEXT CHECK (payment_method IN ('cash', 'cashless')),
	amount_cents INTEGER NOT NULL DEFAULT 0,
	cash_received_cents INTEGER,
	change_cents INTEGER,
	paid_at TEXT
);

CREATE TABLE order_items (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
	guest_id INTEGER NOT NULL REFERENCES order_guests(id) ON DELETE CASCADE,
	menu_item_id INTEGER REFERENCES menu_items(id),
	title TEXT NOT NULL,
	price_cents INTEGER NOT NULL,
	quantity INTEGER NOT NULL DEFAULT 1,
	comment TEXT,
	status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'pending', 'ready', 'out_of_stock')),
	is_custom INTEGER NOT NULL DEFAULT 0,
	sent_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE expenses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	location_id INTEGER NOT NULL REFERENCES locations(id) NOT NULL,
	user_id INTEGER NOT NULL REFERENCES users(id) NOT NULL,
	category TEXT NOT NULL,
	amount_cents INTEGER NOT NULL,
	comment TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_devices_uuid ON devices(device_uuid);
CREATE INDEX idx_devices_code ON devices(device_code);
CREATE INDEX idx_orders_location_status ON orders(location_id, status);
CREATE INDEX idx_orders_shift ON orders(shift_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_status ON order_items(status);
CREATE INDEX idx_order_guests_order ON order_guests(order_id);
CREATE INDEX idx_menu_items_location ON menu_items(location_id, is_active);
CREATE INDEX idx_shifts_location_status ON shifts(location_id, status);
