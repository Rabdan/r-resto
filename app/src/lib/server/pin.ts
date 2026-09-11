import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 32;

export function isValidPin(pin: string): boolean {
	return /^\d{4,8}$/.test(pin);
}

export function hashPin(pin: string): string {
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(pin, salt, KEYLEN).toString('hex');
	return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
	const sep = stored.indexOf(':');
	if (sep < 1) return false;
	const salt = stored.slice(0, sep);
	const hash = stored.slice(sep + 1);
	if (!salt || !hash) return false;
	const actual = scryptSync(pin, salt, KEYLEN);
	const expected = Buffer.from(hash, 'hex');
	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
}
