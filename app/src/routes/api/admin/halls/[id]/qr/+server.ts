import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { uploadsPath } from '$lib/server/paths';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'image/gif': '.gif'
};

function hallOf(id: number, locationId: number) {
	return db
		.prepare(`SELECT id, qr_image_path FROM halls WHERE id = ? AND location_id = ?`)
		.get(id, locationId) as { id: number; qr_image_path: string | null } | undefined;
}

function removeQrFile(rel: string | null) {
	if (!rel) return;
	const root = path.resolve(uploadsPath);
	const full = path.resolve(root, rel);
	if (!full.startsWith(root + path.sep)) return;
	if (fs.existsSync(full) && fs.statSync(full).isFile()) fs.unlinkSync(full);
}

export const POST: RequestHandler = async ({ request, locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const hall = hallOf(id, locationId);
	if (!hall) return json({ error: 'not_found' }, { status: 404 });

	const form = await request.formData().catch(() => null);
	if (!form) return json({ error: 'invalid_form' }, { status: 400 });
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'no_file' }, { status: 400 });
	if (file.size > MAX_BYTES) return json({ error: 'file_too_large' }, { status: 400 });

	const ext = EXT[file.type];
	if (!ext) return json({ error: 'unsupported_type' }, { status: 400 });

	const dir = path.join(uploadsPath, 'qr');
	fs.mkdirSync(dir, { recursive: true });
	const filename = `hall-${id}-${randomUUID()}${ext}`;
	fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

	const imagePath = `qr/${filename}`;
	removeQrFile(hall.qr_image_path);
	db.prepare(`UPDATE halls SET qr_image_path = ? WHERE id = ?`).run(imagePath, id);

	return json({ ok: true, qr_image_path: imagePath });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const id = Number(params.id);
	const hall = hallOf(id, locationId);
	if (!hall) return json({ error: 'not_found' }, { status: 404 });

	removeQrFile(hall.qr_image_path);
	db.prepare(`UPDATE halls SET qr_image_path = NULL WHERE id = ?`).run(id);

	return json({ ok: true });
};
