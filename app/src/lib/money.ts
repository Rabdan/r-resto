import { CURRENCIES, DEFAULT_CURRENCY } from './currency';

let code = DEFAULT_CURRENCY;

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(cfg: { code: string; locale: string; digits: number }): Intl.NumberFormat {
	let fmt = formatters.get(cfg.code);
	if (!fmt) {
		fmt = new Intl.NumberFormat(cfg.locale, {
			style: 'currency',
			currency: cfg.code,
			minimumFractionDigits: cfg.digits,
			maximumFractionDigits: cfg.digits
		});
		formatters.set(cfg.code, fmt);
	}
	return fmt;
}

export function setCurrency(next: string): void {
	if (CURRENCIES[next]) code = next;
}

export function getCurrency(): string {
	return code;
}

/** Store money as integer minor units. Format using the configured currency. */
export function formatMoney(cents: number): string {
	const cfg = CURRENCIES[code] ?? CURRENCIES[DEFAULT_CURRENCY];
	return formatterFor(cfg).format(cents / cfg.minorUnits);
}

/** Convert a user-entered major-unit amount into integer minor units. */
export function parseMoney(input: string | number): number {
	const cfg = CURRENCIES[code] ?? CURRENCIES[DEFAULT_CURRENCY];
	const value = typeof input === 'string' ? Number(input) : input;
	if (!Number.isFinite(value)) return NaN;
	return Math.round(value * cfg.minorUnits);
}

export function currencySymbol(): string {
	const cfg = CURRENCIES[code] ?? CURRENCIES[DEFAULT_CURRENCY];
	return cfg.symbol;
}
