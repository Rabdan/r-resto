import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { uploadsPath } from '$lib/server/paths';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'image/gif': '.gif'
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;

	const form = await request.formData().catch(() => null);
	if (!form) return json({ error: 'invalid_form' }, { status: 400 });
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'no_file' }, { status: 400 });
	if (file.size > MAX_BYTES) return json({ error: 'file_too_large' }, { status: 400 });

	const ext = EXT[file.type];
	if (!ext) return json({ error: 'unsupported_type' }, { status: 400 });

	const filename = `${randomUUID()}${ext}`;
	const dir = path.join(uploadsPath, 'menu');
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

	return json({ image_path: `menu/${filename}` });
};
