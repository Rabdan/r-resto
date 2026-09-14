import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { uploadsPath } from '$lib/server/paths';
import type { RequestHandler } from './$types';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const hall = db
		.prepare(`SELECT id FROM halls WHERE id = ? AND location_id = ?`)
		.get(id, locationId) as { id: number } | undefined;
	if (!hall) return json({ error: 'not_found' }, { status: 404 });

	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		color_hex?: string;
		is_active?: boolean;
	};

	if (body.name !== undefined) {
		const name = (body.name ?? '').trim();
		if (!name) return json({ error: 'Название не может быть пустым' }, { status: 400 });
		db.prepare(`UPDATE halls SET name = ? WHERE id = ?`).run(name, id);
	}
	if (body.color_hex !== undefined && COLOR_RE.test(body.color_hex)) {
		db.prepare(`UPDATE halls SET color_hex = ? WHERE id = ?`).run(body.color_hex, id);
	}
	if (body.is_active !== undefined) {
		if (body.is_active) {
			db.prepare(`UPDATE halls SET is_active = 1, closed_at = NULL WHERE id = ?`).run(id);
		} else {
			db.prepare(`UPDATE halls SET is_active = 0, closed_at = datetime('now') WHERE id = ?`).run(id);
		}
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const hall = db
		.prepare(`SELECT id FROM halls WHERE id = ? AND location_id = ?`)
		.get(id, locationId) as { id: number } | undefined;
	if (!hall) return json({ error: 'not_found' }, { status: 404 });

	const count = db
		.prepare(`SELECT COUNT(*) AS n FROM orders WHERE hall_id = ?`)
		.get(id) as { n: number };
	if (count.n > 0) {
		db.prepare(`UPDATE halls SET is_active = 0, closed_at = datetime('now') WHERE id = ?`).run(id);
		return json({ ok: true, blocked: true });
	}

	const qr = db.prepare(`SELECT qr_image_path FROM halls WHERE id = ?`).get(id) as
		| { qr_image_path: string | null }
		| undefined;
	if (qr?.qr_image_path) {
		const root = path.resolve(uploadsPath);
		const full = path.resolve(root, qr.qr_image_path);
		if (full.startsWith(root + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile()) {
			fs.unlinkSync(full);
		}
	}

	db.prepare(`DELETE FROM halls WHERE id = ?`).run(id);
	return json({ ok: true });
};
