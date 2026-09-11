import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.admin) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	return json({
		admin: {
			id: locals.admin.id,
			name: locals.admin.name,
			isSuperadmin: locals.admin.isSuperadmin
		}
	});
};
