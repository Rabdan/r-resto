import { json } from '@sveltejs/kit';
import ExcelJS from 'exceljs';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/admin';
import { CURRENCIES, DEFAULT_CURRENCY } from '$lib/currency';
import { getZReport, listShifts } from '$lib/server/shifts';
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
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const denied = requireAdmin(locals);
	if (denied) return denied;
	const locationId = locals.admin!.locationId;
	if (!locationId) return json({ error: 'no_location' }, { status: 400 });

	const shiftId = Number(params.id);
	const shift = listShifts(db, locationId).find((s) => s.id === shiftId);
	const z = getZReport(db, locationId, shiftId);
	if (!shift || !z) return json({ error: 'not_found' }, { status: 404 });

	const currencyRow = db.prepare(`SELECT currency FROM locations WHERE id = ?`).get(locationId) as
		| { currency: string }
		| undefined;
	const currency = CURRENCIES[currencyRow?.currency ?? ''] ?? CURRENCIES[DEFAULT_CURRENCY];
	const numFmt = currency.digits === 0 ? '#,##0' : '#,##0.00';
	const money = (cents: number): number => cents / currency.minorUnits;
	const sumLabel = `Сумма, ${currency.symbol}`;

	const workbook = new ExcelJS.Workbook();
	workbook.creator = 'R-resto';

	const sheet = workbook.addWorksheet('Z-отчёт');
	sheet.columns = [
		{ header: 'Показатель', key: 'label', width: 28 },
		{ header: sumLabel, key: 'value', width: 16 }
	];
	sheet.addRow({ label: 'Смена №', value: shiftId });
	sheet.addRow({ label: 'Открыта', value: shift.opened_at });
	sheet.addRow({ label: 'Закрыта', value: shift.closed_at ?? '' });
	sheet.addRow({ label: 'Чеков закрыто', value: z.orders_count });
	sheet.addRow({ label: 'Наличные', value: money(z.cash_cents) });
	sheet.addRow({ label: 'Безналичные', value: money(z.cashless_cents) });
	sheet.addRow({ label: 'Выручка', value: money(z.total_cents) });
	sheet.addRow({ label: 'Расходы', value: money(shift.expenses_cents) });
	const totalRow = sheet.addRow({ label: 'Итого', value: money(shift.net_cents) });
	totalRow.font = { bold: true };
	sheet.getColumn('value').numFmt = numFmt;
	styleHeader(sheet);

	const halls = workbook.addWorksheet('По залам');
	halls.columns = [
		{ header: 'Зал', key: 'name', width: 28 },
		{ header: sumLabel, key: 'cents', width: 16 }
	];
	for (const row of z.by_halls) halls.addRow({ name: row.name, cents: money(row.cents) });
	halls.getColumn('cents').numFmt = numFmt;
	styleHeader(halls);

	const waiters = workbook.addWorksheet('По официантам');
	waiters.columns = [
		{ header: 'Официант', key: 'name', width: 28 },
		{ header: sumLabel, key: 'cents', width: 16 }
	];
	for (const row of z.by_waiters) waiters.addRow({ name: row.name, cents: money(row.cents) });
	waiters.getColumn('cents').numFmt = numFmt;
	styleHeader(waiters);

	const buffer = await workbook.xlsx.writeBuffer();
	const filename = `Z_Report_Shift_${shiftId}.xlsx`;
	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
