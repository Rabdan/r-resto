export type Currency = {
	code: string;
	label: string;
	symbol: string;
	locale: string;
	/** Minor units per 1 major unit (kopecks/dong). RUB=100, VND=1. */
	minorUnits: number;
	/** Fraction digits shown when formatting. */
	digits: number;
};

export const DEFAULT_CURRENCY = 'VND';

export const CURRENCIES: Record<string, Currency> = {
	VND: { code: 'VND', label: 'Вьетнамский донг', symbol: '₫', locale: 'vi-VN', minorUnits: 1, digits: 0 },
	RUB: { code: 'RUB', label: 'Российский рубль', symbol: '₽', locale: 'ru-RU', minorUnits: 100, digits: 2 },
	USD: { code: 'USD', label: 'Доллар США', symbol: '$', locale: 'en-US', minorUnits: 100, digits: 2 },
	EUR: { code: 'EUR', label: 'Евро', symbol: '€', locale: 'de-DE', minorUnits: 100, digits: 2 }
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);
