import { db } from './db';
import { DEFAULT_TIMEZONE, isValidTimezone } from '$lib/timezone';
import { zonedToUtcMs } from '$lib/time';

export function timezoneOf(locationId: number | null): string {
	if (!locationId) return DEFAULT_TIMEZONE;
	const row = db.prepare(`SELECT timezone FROM locations WHERE id = ?`).get(locationId) as
		| { timezone: string }
		| undefined;
	return row?.timezone && isValidTimezone(row.timezone) ? row.timezone : DEFAULT_TIMEZONE;
}

function parseIso(value: string): { y: number; m: number; d: number } | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!m) return null;
	return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function nextIsoDate(value: string): string {
	const p = parseIso(value)!;
	const d = new Date(Date.UTC(p.y, p.m, p.d));
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function toSqlite(ms: number): string {
	return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Inclusive local-date range `[from, to]` converted to a UTC instant range
 * `[fromUtc, toUtc)` that can be compared directly against stored UTC timestamps.
 */
export function utcDayRange(
	from: string,
	to: string,
	timeZone: string
): { fromUtc: string; toUtc: string } {
	const fp = parseIso(from)!;
	const fromMs = zonedToUtcMs(timeZone, fp.y, fp.m, fp.d, 0, 0);

	const tp = parseIso(nextIsoDate(to))!;
	const toMs = zonedToUtcMs(timeZone, tp.y, tp.m, tp.d, 0, 0);

	return { fromUtc: toSqlite(fromMs), toUtc: toSqlite(toMs) };
}
