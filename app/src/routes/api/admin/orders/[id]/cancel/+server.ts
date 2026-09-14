import { json, type RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { broadcast } from '$lib/server/sse';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const orderId = Number(params.id);
	if (!orderId) return json({ error: 'invalid_id' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as { reason?: string };
	const reason = (body.reason ?? '').trim();
	if (reason.length < 2) {
		return json({ error: 'reason_required' }, { status: 400 });
	}

	const order = db
		.prepare(`SELECT id, status FROM orders WHERE id = ? AND location_id = ?`)
		.get(orderId, locationId) as { id: number; status: string } | undefined;
	if (!order) return json({ error: 'not_found' }, { status: 404 });
	if (order.status !== 'open') {
		return json({ error: 'not_open' }, { status: 409 });
	}

	db.prepare(
		`UPDATE orders
		 SET status = 'cancelled',
		     cancel_reason = ?,
		     cancelled_by_user_id = ?,
		     cancelled_at = datetime('now')
		 WHERE id = ?`
	).run(reason, locals.admin!.id, orderId);

	broadcast('ORDER_CANCELLED', {
		orderId,
		locationId,
		reason,
		cancelledBy: locals.admin!.name
	});

	return json({ ok: true, id: orderId });
};
