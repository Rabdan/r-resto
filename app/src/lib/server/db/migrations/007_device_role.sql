-- Роль официанта/кухни теперь у устройства, а не у сотрудника.
ALTER TABLE devices ADD COLUMN role TEXT CHECK (role IN ('waiter', 'kitchen'));

-- Переносим роль со старых пользователей на их устройства.
UPDATE devices
SET role = (
	SELECT CASE u.role WHEN 'waiter' THEN 'waiter' WHEN 'kitchen' THEN 'kitchen' ELSE NULL END
	FROM users u
	WHERE u.id = devices.assigned_user_id
)
WHERE assigned_user_id IS NOT NULL;

-- У сотрудника роль теперь только 'staff' или 'admin' (admin = задан PIN).
CREATE TABLE users_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	pin_hash TEXT,
	is_superadmin INTEGER NOT NULL DEFAULT 0
);

INSERT INTO users_new (id, name, role, is_active, created_at, pin_hash, is_superadmin)
SELECT id, name,
       CASE WHEN role = 'admin' THEN 'admin' ELSE 'staff' END,
       is_active, created_at, pin_hash, is_superadmin
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
