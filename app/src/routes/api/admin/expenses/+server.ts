import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { createExpense, parseExpenseTime } from '$lib/server/expenses';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const body = (await request.json().catch(() => ({}))) as {
		amount_cents?: number;
		payment_method?: string;
		comment?: string;
		created_at?: string;
	};

	const amountCents = Math.round(Number(body.amount_cents));
	const paymentMethod = body.payment_method;
	if (paymentMethod !== 'cash' && paymentMethod !== 'cashless') {
		return json({ error: 'Укажи тип расхода' }, { status: 400 });
	}

	const createdAtRaw = (body.created_at ?? '').trim();
	const createdAt = createdAtRaw ? parseExpenseTime(createdAtRaw) : null;
	if (createdAtRaw && !createdAt) {
		return json({ error: 'Некорректное время' }, { status: 400 });
	}

	const comment = (body.comment ?? '').trim() || null;

	const result = createExpense(db, {
		locationId,
		userId: locals.admin!.id,
		amountCents,
		paymentMethod,
		comment,
		createdAt
	});

	if ('error' in result) {
		if (result.error === 'no_open_shift') {
			return json({ error: 'Смена не открыта' }, { status: 409 });
		}
		if (result.error === 'invalid_amount') {
			return json({ error: 'Укажи сумму больше нуля' }, { status: 400 });
		}
		return json({ error: 'Не удалось сохранить расход' }, { status: 400 });
	}

	return json({ ok: true, id: result.id });
};
