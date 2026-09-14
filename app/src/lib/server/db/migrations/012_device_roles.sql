-- Несколько POS-ролей на одно устройство (официант и кухня одновременно).
CREATE TABLE IF NOT EXISTS device_roles (
	device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
	role TEXT NOT NULL CHECK (role IN ('waiter', 'kitchen')),
	PRIMARY KEY (device_id, role)
);

INSERT OR IGNORE INTO device_roles (device_id, role)
SELECT id, role FROM devices WHERE role IN ('waiter', 'kitchen');
