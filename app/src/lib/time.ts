import { getTimezone } from './timezone';

const DB_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/** Parse a UTC timestamp stored by SQLite (`YYYY-MM-DD HH:MM[:SS]`) into epoch ms. */
export function parseDbTimeMs(dbTime: string | null | undefined): number | null {
	if (!dbTime) return null;
	const m = DB_TIME_RE.exec(dbTime);
	if (!m) return null;
	return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

export type ZonedParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

/** Wall-clock parts of an epoch ms instant in a given IANA timezone. */
export function zonedParts(ms: number, timeZone?: string): ZonedParts {
	const tz = timeZone ?? getTimezone();
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
	const map: Record<string, string> = {};
	for (const part of dtf.formatToParts(new Date(ms))) map[part.type] = part.value;
	return {
		year: Number(map.year),
		month: Number(map.month),
		day: Number(map.day),
		hour: Number(map.hour) % 24,
		minute: Number(map.minute),
		second: Number(map.second)
	};
}

/** Offset (ms) of a timezone at a given UTC instant: local = utc + offset. */
function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
	const p = zonedParts(utcMs, timeZone);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	return asUtc - utcMs;
}

/** Convert a local wall-clock time in a timezone to a UTC epoch ms (2 iterations handle DST edges). */
export function zonedToUtcMs(
	timeZone: string,
	year: number,
	month0: number,
	day: number,
	hour: number,
	minute: number
): number {
	let guess = Date.UTC(year, month0, day, hour, minute, 0);
	for (let i = 0; i < 2; i++) {
		const offset = timeZoneOffsetMs(timeZone, guess);
		guess = Date.UTC(year, month0, day, hour, minute, 0) - offset;
	}
	return guess;
}

/** `HH:MM` in the configured timezone (default) or an explicit one. */
export function formatDbTimeHm(dbTime: string | null | undefined, timeZone?: string): string {
	const ms = parseDbTimeMs(dbTime);
	if (ms == null) return '—';
	const p = zonedParts(ms, timeZone);
	return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** `DD.MM.YYYY HH:MM` in the configured timezone (default) or an explicit one. */
export function formatDbDateTime(dbTime: string | null | undefined, timeZone?: string): string {
	const ms = parseDbTimeMs(dbTime);
	if (ms == null) return '—';
	const p = zonedParts(ms, timeZone);
	return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** `YYYY-MM-DDTHH:MM` for a local `<input type="datetime-local">`, in the configured timezone. */
export function nowLocalInput(timeZone?: string): string {
	const p = zonedParts(Date.now(), timeZone);
	return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Convert a local `<input type="datetime-local">` value into a UTC SQLite timestamp. */
export function localInputToDbTime(input: string, timeZone?: string): string | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input.trim());
	if (!m) return null;
	const ms = zonedToUtcMs(
		timeZone ?? getTimezone(),
		Number(m[1]),
		Number(m[2]) - 1,
		Number(m[3]),
		Number(m[4]),
		Number(m[5])
	);
	return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}
