import { json } from '@sveltejs/kit';
import { broadcast } from '$lib/server/sse';
import {
	closeOrder,
	getOpenOrder,
	loadOrder,
	waiterLocationId
} from '$lib/server/orders';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	const locationId = waiterLocationId(locals);
	if (!locationId) return json({ error: 'forbidden' }, { status: 403 });

	const orderId = Number(params.id);
	const order = getOpenOrder(orderId, locationId);
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') return json({ error: 'not_open' }, { status: 409 });

	if (!closeOrder(orderId, locationId)) {
		return json({ error: 'not_open' }, { status: 409 });
	}

	broadcast('ORDER_CLOSED', { orderId, locationId });
	return json({ order: loadOrder(orderId, locationId) });
};
