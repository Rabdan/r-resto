import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { deleteExpense } from '$lib/server/expenses';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const expenseId = Number(params.id);
	if (!expenseId) return json({ error: 'invalid_id' }, { status: 400 });

	const result = deleteExpense(db, { locationId, expenseId });
	if ('error' in result) {
		if (result.error === 'not_found') return json({ error: 'not_found' }, { status: 404 });
		if (result.error === 'shift_closed') {
			return json({ error: 'Нельзя менять расходы закрытой смены' }, { status: 409 });
		}
		return json({ error: 'Не удалось удалить расход' }, { status: 400 });
	}

	return json({ ok: true });
};
