/** Inclusive date range YYYY-MM-DD. Previous period is the same length immediately before `from`. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
	const start = parseIsoDate(from);
	const end = parseIsoDate(to);
	if (!start || !end || end < start) {
		throw new Error('invalid_range');
	}
	const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
	const prevTo = addDays(start, -1);
	const prevFrom = addDays(prevTo, -(days - 1));
	return { from: formatIsoDate(prevFrom), to: formatIsoDate(prevTo) };
}

export function isIsoDate(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && Boolean(parseIsoDate(value));
}

function parseIsoDate(value: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!m) return null;
	const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	if (formatIsoDate(date) !== value) return null;
	return date;
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function formatIsoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function defaultReportRange(): { from: string; to: string } {
	const now = new Date();
	const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	const fromDate = addDays(parseIsoDate(to)!, -6);
	return { from: formatIsoDate(fromDate), to };
}
