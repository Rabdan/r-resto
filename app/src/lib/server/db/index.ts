import Database from 'better-sqlite3';
import { databasePath, ensureDataDirs } from '../paths';
import { migrate } from './migrate';

let instance: Database.Database | undefined;

export function getDb(): Database.Database {
	if (!instance) {
		ensureDataDirs();
		instance = new Database(databasePath);
		instance.pragma('journal_mode = WAL');
		instance.pragma('foreign_keys = ON');
		instance.pragma('busy_timeout = 5000');
		migrate(instance);
	}
	return instance;
}

/** Lazy proxy so importing this module during `vite build` does not open SQLite. */
export const db: Database.Database = new Proxy({} as Database.Database, {
	get(_target, prop) {
		const real = getDb();
		const value = Reflect.get(real, prop, real) as unknown;
		return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value;
	}
});
