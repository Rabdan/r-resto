import { parseDbTimeMs } from './time';

export { parseDbTimeMs };

export const READY_VISIBLE_MS = 10_000;

export function waiterSeesReady(
	status: string,
	readyAt: string | null | undefined,
	now = Date.now()
): boolean {
	if (status !== 'ready') return false;
	const t = parseDbTimeMs(readyAt);
	if (t == null) return false;
	return now - t >= READY_VISIBLE_MS;
}

export function msUntilWaiterSeesReady(
	status: string,
	readyAt: string | null | undefined,
	now = Date.now()
): number | null {
	if (status !== 'ready') return null;
	const t = parseDbTimeMs(readyAt);
	if (t == null) return null;
	const left = READY_VISIBLE_MS - (now - t);
	return left > 0 ? left : 0;
}
