import type Database from 'better-sqlite3';
import sql001 from './migrations/001_init.sql?raw';
import sql002 from './migrations/002_seed.sql?raw';
import sql003 from './migrations/003_admin_pin.sql?raw';
import sql004 from './migrations/004_currency.sql?raw';
import sql005 from './migrations/005_menu_admin.sql?raw';
import sql006 from './migrations/006_admin_modernization.sql?raw';
import sql007 from './migrations/007_device_role.sql?raw';
import sql008 from './migrations/008_staff_block.sql?raw';
import sql009 from './migrations/009_device_halls.sql?raw';
import sql010 from './migrations/010_shift_expenses.sql?raw';
import sql011 from './migrations/011_hall_qr.sql?raw';
import sql012 from './migrations/012_device_roles.sql?raw';
import sql013 from './migrations/013_item_ready_at.sql?raw';
import sql014 from './migrations/014_timezone.sql?raw';
import sql015 from './migrations/015_partial_payments.sql?raw';
import sql016 from './migrations/016_order_number.sql?raw';
import sql017 from './migrations/017_hall_shifts.sql?raw';
import sql018 from './migrations/018_cleanup_shifts.sql?raw';
import sql019 from './migrations/019_check_number.sql?raw';
import { hashPin } from '../pin';

const migrations: Array<{ id: string; sql: string }> = [
	{ id: '001_init.sql', sql: sql001 },
	{ id: '002_seed.sql', sql: sql002 },
	{ id: '003_admin_pin.sql', sql: sql003 },
	{ id: '004_currency.sql', sql: sql004 },
	{ id: '005_menu_admin.sql', sql: sql005 },
	{ id: '006_admin_modernization.sql', sql: sql006 },
	{ id: '007_device_role.sql', sql: sql007 },
	{ id: '008_staff_block.sql', sql: sql008 },
	{ id: '009_device_halls.sql', sql: sql009 },
	{ id: '010_shift_expenses.sql', sql: sql010 },
	{ id: '011_hall_qr.sql', sql: sql011 },
	{ id: '012_device_roles.sql', sql: sql012 },
	{ id: '013_item_ready_at.sql', sql: sql013 },
	{ id: '014_timezone.sql', sql: sql014 },
	{ id: '015_partial_payments.sql', sql: sql015 },
	{ id: '016_order_number.sql', sql: sql016 },
	{ id: '017_hall_shifts.sql', sql: sql017 },
	{ id: '018_cleanup_shifts.sql', sql: sql018 },
	{ id: '019_check_number.sql', sql: sql019 }
];

const DEFAULT_SUPERADMIN_PIN = '1708';

export function migrate(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			id TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);

	const applied = new Set(
		db.prepare('SELECT id FROM schema_migrations').all().map((row) => (row as { id: string }).id)
	);

	// Пересоздание таблицы `users` (007) требует выключенных FK на время миграций.
	db.pragma('foreign_keys = OFF');
	for (const { id, sql } of migrations) {
		if (applied.has(id)) continue;
		db.transaction(() => {
			db.exec(sql);
			db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(id);
		})();
	}
	db.pragma('foreign_keys = ON');

	ensureSuperadminPin(db);
}

function ensureSuperadminPin(db: Database.Database): void {
	const row = db
		.prepare(
			`SELECT id, pin_hash FROM users WHERE is_superadmin = 1 AND role = 'admin' LIMIT 1`
		)
		.get() as { id: number; pin_hash: string | null } | undefined;

	if (!row) return;
	if (row.pin_hash) return;

	db.prepare(`UPDATE users SET pin_hash = ? WHERE id = ?`).run(hashPin(DEFAULT_SUPERADMIN_PIN), row.id);
}
