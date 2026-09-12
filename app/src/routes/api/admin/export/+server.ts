import { json } from '@sveltejs/kit';
import ExcelJS from 'exceljs';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { isIsoDate } from '$lib/period';
import { CURRENCIES, DEFAULT_CURRENCY } from '$lib/currency';
import { compareProducts, expensesInRange, ordersInRange, paymentSummary, productSales, salesByHalls, salesByWaiters, shiftsInRange } from '$lib/server/reports';
import type { RequestHandler } from './$types';

const headerFill: ExcelJS.Fill = {
	type: 'pattern',
	pattern: 'solid',
	fgColor: { argb: 'FF1E293B' }
};
const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFF8FAFC' } };

function styleHeader(sheet: ExcelJS.Worksheet): void {
	const row = sheet.getRow(1);
	row.font = headerFont;
	row.fill = headerFill;
	row.alignment = { vertical: 'middle' };
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const currencyRow = db.prepare(`SELECT currency FROM locations WHERE id = ?`).get(locationId) as
		| { currency: string }
		| undefined;
	const currency = CURRENCIES[currencyRow?.currency ?? ''] ?? CURRENCIES[DEFAULT_CURRENCY];
	const numFmt = currency.digits === 0 ? '#,##0' : '#,##0.00';
	const money = (cents: number): number => cents / currency.minorUnits;
	const sumLabel = `Сумма, ${currency.symbol}`;

	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	if (!isIsoDate(from) || !isIsoDate(to)) {
		return json({ error: 'invalid_range' }, { status: 400 });
	}

	let previous: { from: string; to: string };
	let products: ReturnType<typeof compareProducts>['products'];
	try {
		const compared = compareProducts(db, locationId, from, to);
		previous = compared.previous;
		products = compared.products;
	} catch {
		return json({ error: 'invalid_range' }, { status: 400 });
	}

	const orders = ordersInRange(db, locationId, from, to);
	const sales = productSales(db, locationId, from, to);
	const expenses = expensesInRange(db, locationId, from, to);
	const summary = paymentSummary(db, locationId, from, to);
	const byHalls = salesByHalls(db, locationId, from, to);
	const byWaiters = salesByWaiters(db, locationId, from, to);
	const shifts = shiftsInRange(db, locationId, from, to);

	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'R-resto';

	const checks = workbook.addWorksheet('Чеки');
	checks.columns = [
		{ header: 'ID', key: 'id', width: 10 },
		{ header: 'Создан', key: 'created_at', width: 20 },
		{ header: 'Официант', key: 'waiter_name', width: 20 },
		{ header: 'Оплата', key: 'payment_method', width: 14 },
		{ header: 'Статус', key: 'status', width: 14 },
		{ header: sumLabel, key: 'total', width: 14 }
	];
	for (const row of orders) {
		checks.addRow({
			id: row.id,
			created_at: row.created_at,
			waiter_name: row.waiter_name,
			payment_method: row.payment_method === 'cash' ? 'Наличные' : row.payment_method === 'cashless' ? 'Безнал' : '—',
			status: row.status === 'closed' ? 'Закрыт' : 'Отменён',
			total: money(row.total_cents)
		});
	}
	checks.getColumn('total').numFmt = numFmt;
	styleHeader(checks);
	const checkTotal = orders.reduce((sum, row) => sum + (row.status === 'closed' ? row.total_cents : 0), 0);
	const totalRow = checks.addRow({ waiter_name: 'Итого закрытых', total: money(checkTotal) });
	totalRow.font = { bold: true };

	const goods = workbook.addWorksheet('Товары');
	goods.columns = [
		{ header: 'Товар', key: 'title', width: 28 },
		{ header: 'Кол-во', key: 'qty', width: 12 },
		{ header: sumLabel, key: 'amount', width: 14 }
	];
	for (const row of sales) {
		goods.addRow({ title: row.title, qty: row.qty, amount: money(row.amount_cents) });
	}
	goods.getColumn('amount').numFmt = numFmt;
	styleHeader(goods);

	const cmp = workbook.addWorksheet('Сравнение');
	cmp.columns = [
		{ header: 'Товар', key: 'title', width: 28 },
		{ header: 'Текущий кол-во', key: 'currentQty', width: 16 },
		{ header: `Текущий сумма, ${currency.symbol}`, key: 'currentAmount', width: 18 },
		{ header: 'Прошлый кол-во', key: 'prevQty', width: 16 },
		{ header: `Прошлый сумма, ${currency.symbol}`, key: 'prevAmount', width: 18 },
		{ header: 'Динамика %', key: 'deltaPct', width: 14 }
	];
	cmp.addRow({ title: `Текущий: ${from} — ${to}` });
	cmp.addRow({ title: `Прошлый: ${previous.from} — ${previous.to}` });
	for (const row of products) {
		cmp.addRow({
			title: row.title,
			currentQty: row.currentQty,
			currentAmount: money(row.currentCents),
			prevQty: row.prevQty,
			prevAmount: money(row.prevCents),
			deltaPct: row.deltaPct === null ? null : Math.round(row.deltaPct * 10) / 10
		});
	}
	cmp.getColumn('currentAmount').numFmt = numFmt;
	cmp.getColumn('prevAmount').numFmt = numFmt;
	styleHeader(cmp);

	const exp = workbook.addWorksheet('Расходы');
	exp.columns = [
		{ header: 'Дата', key: 'created_at', width: 20 },
		{ header: 'Тип', key: 'payment_method', width: 16 },
		{ header: sumLabel, key: 'amount', width: 14 },
		{ header: 'Автор', key: 'author', width: 18 },
		{ header: 'Примечание', key: 'comment', width: 32 }
	];
	for (const row of expenses) {
		exp.addRow({
			created_at: row.created_at,
			payment_method: row.payment_method === 'cash' ? 'Наличные' : 'Банк',
			amount: money(row.amount_cents),
			author: row.author,
			comment: row.comment ?? ''
		});
	}
	exp.getColumn('amount').numFmt = numFmt;
	styleHeader(exp);

	const sumSheet = workbook.addWorksheet('Сводка');
	sumSheet.columns = [
		{ header: 'Показатель', key: 'label', width: 24 },
		{ header: sumLabel, key: 'value', width: 16 }
	];
	sumSheet.addRow({ label: 'Чеков закрыто', value: summary.orders_count });
	sumSheet.addRow({ label: 'Наличные', value: money(summary.cash_cents) });
	sumSheet.addRow({ label: 'Безналичные', value: money(summary.cashless_cents) });
	const sumTotal = sumSheet.addRow({ label: 'Итого', value: money(summary.total_cents) });
	sumTotal.font = { bold: true };
	sumSheet.getColumn('value').numFmt = numFmt;
	styleHeader(sumSheet);

	const halls = workbook.addWorksheet('По залам');
	halls.columns = [
		{ header: 'Зал', key: 'name', width: 24 },
		{ header: 'Кол-во', key: 'qty', width: 12 },
		{ header: 'Чеков', key: 'orders', width: 12 },
		{ header: sumLabel, key: 'amount', width: 16 }
	];
	for (const row of byHalls) {
		halls.addRow({ name: row.name, qty: row.qty, orders: row.orders_count, amount: money(row.amount_cents) });
	}
	halls.getColumn('amount').numFmt = numFmt;
	styleHeader(halls);

	const waiters = workbook.addWorksheet('По официантам');
	waiters.columns = [
		{ header: 'Официант', key: 'name', width: 24 },
		{ header: 'Чеков', key: 'orders', width: 12 },
		{ header: `Средний чек, ${currency.symbol}`, key: 'avg', width: 18 },
		{ header: sumLabel, key: 'amount', width: 16 }
	];
	for (const row of byWaiters) {
		waiters.addRow({ name: row.name, orders: row.orders_count, avg: money(row.avg_cents), amount: money(row.amount_cents) });
	}
	waiters.getColumn('avg').numFmt = numFmt;
	waiters.getColumn('amount').numFmt = numFmt;
	styleHeader(waiters);

	const shiftsSheet = workbook.addWorksheet('По сменам');
	shiftsSheet.columns = [
		{ header: 'Смена', key: 'id', width: 10 },
		{ header: 'Открыта', key: 'opened_at', width: 20 },
		{ header: 'Закрыта', key: 'closed_at', width: 20 },
		{ header: 'Чеков', key: 'orders', width: 12 },
		{ header: 'Наличные', key: 'cash', width: 14 },
		{ header: 'Безнал', key: 'cashless', width: 14 },
		{ header: sumLabel, key: 'total', width: 16 }
	];
	for (const row of shifts) {
		shiftsSheet.addRow({
			id: row.id,
			opened_at: row.opened_at,
			closed_at: row.closed_at ?? '',
			orders: row.orders_count,
			cash: money(row.cash_cents),
			cashless: money(row.cashless_cents),
			total: money(row.total_cents)
		});
	}
	shiftsSheet.getColumn('cash').numFmt = numFmt;
	shiftsSheet.getColumn('cashless').numFmt = numFmt;
	shiftsSheet.getColumn('total').numFmt = numFmt;
	styleHeader(shiftsSheet);

	const buffer = await workbook.xlsx.writeBuffer();
	const filename = `Report_Sales_${from}_${to}.xlsx`;
	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
