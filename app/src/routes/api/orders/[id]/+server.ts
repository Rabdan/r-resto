import { json } from '@sveltejs/kit';
import { loadOrder, waiterLocationId } from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const order = loadOrder(Number(params.id), locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	return json({ order });
};
