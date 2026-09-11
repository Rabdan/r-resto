import { json } from '@sveltejs/kit';
import { loadPrecheck, waiterLocationId } from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const precheck = loadPrecheck(Number(params.id), locationId);
	if (!precheck) return json({ error: 'not_found' }, { status: 404 });
	return json({ precheck });
};
