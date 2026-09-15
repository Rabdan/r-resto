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

	const total = db
		.prepare(`SELECT COALESCE(SUM(shortfall_cents), 0) AS n FROM order_guests WHERE order_id = ?`)
		.get(orderId) as { n: number };
	if (total.n <= 0) return json({ error: 'no_shortfall' }, { status: 409 });

	db.transaction(() => {
		db.prepare(
			`UPDATE order_guests
			 SET writeoff_cents = writeoff_cents + shortfall_cents,
			     writeoff_reason = ?,
			     shortfall_cents = 0
			 WHERE order_id = ? AND shortfall_cents > 0`
		).run(reason, orderId);
	})();

	broadcast('ORDER_UPDATED', { orderId, locationId });

	return json({ ok: true, id: orderId });
};
