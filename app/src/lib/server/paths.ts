import fs from 'node:fs';
import path from 'node:path';

function envPath(name: string, fallbackFromCwd: string): string {
	return process.env[name] ?? path.resolve(process.cwd(), fallbackFromCwd);
}

/** cwd in dev is `app/`; in Docker set DATABASE_PATH / UPLOADS_PATH. */
export const databasePath = envPath('DATABASE_PATH', '../data/sqlite/pos.db');
export const uploadsPath = envPath('UPLOADS_PATH', '../data/uploads');

export function ensureDataDirs(): void {
	fs.mkdirSync(path.dirname(databasePath), { recursive: true });
	fs.mkdirSync(path.join(uploadsPath, 'menu'), { recursive: true });
	fs.mkdirSync(path.join(uploadsPath, 'qr'), { recursive: true });
}
