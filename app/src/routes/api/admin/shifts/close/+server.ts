import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { broadcast } from '$lib/server/sse';
import { closeOpenShiftForHall } from '$lib/server/shifts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as { hallId?: number };
	const hallId = Number(body.hallId);
	if (!hallId) return json({ error: 'hall_required' }, { status: 400 });

	const result = closeOpenShiftForHall(db, locationId, hallId, locals.admin!.id);
	if ('error' in result) {
		if (result.error === 'open_orders') {
			return json({ error: 'Сначала закрой или отмени незакрытые заказы' }, { status: 409 });
		}
		if (result.error === 'open_shortfalls') {
			return json({ error: 'Сначала спиши недоплаты по заказам' }, { status: 409 });
		}
		return json({ error: 'Смена не открыта' }, { status: 409 });
	}

	broadcast('SHIFT_CLOSED', { shiftId: result.shiftId, hallId, locationId });
	return json({ ok: true, shiftId: result.shiftId, z: result.z });
};
