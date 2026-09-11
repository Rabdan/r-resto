import fs from 'node:fs';
import path from 'node:path';
import { uploadsPath } from '$lib/server/paths';
import type { RequestHandler } from './$types';

const MIME: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml'
};

export const GET: RequestHandler = ({ params }) => {
	const rel = params.path ?? '';
	const root = path.resolve(uploadsPath);
	const full = path.resolve(root, rel);
	if (!full.startsWith(root + path.sep)) {
		return new Response('not found', { status: 404 });
	}
	if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
		return new Response('not found', { status: 404 });
	}
	const type = MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream';
	return new Response(fs.readFileSync(full), {
		headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' }
	});
};
