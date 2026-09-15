export const DEFAULT_TIMEZONE = 'UTC';

export type TimezoneOption = { value: string; label: string };

export const TIMEZONES: TimezoneOption[] = [
	{ value: 'UTC', label: 'UTC' },
	{ value: 'Europe/Kaliningrad', label: 'Калининград' },
	{ value: 'Europe/Moscow', label: 'Москва' },
	{ value: 'Europe/Samara', label: 'Самара' },
	{ value: 'Europe/Minsk', label: 'Минск' },
	{ value: 'Europe/Kyiv', label: 'Киев' },
	{ value: 'Europe/London', label: 'Лондон' },
	{ value: 'Europe/Paris', label: 'Париж' },
	{ value: 'Europe/Berlin', label: 'Берлин' },
	{ value: 'Asia/Tashkent', label: 'Ташкент' },
	{ value: 'Asia/Almaty', label: 'Алматы' },
	{ value: 'Asia/Bishkek', label: 'Бишкек' },
	{ value: 'Asia/Dubai', label: 'Дубай' },
	{ value: 'Asia/Ho_Chi_Minh', label: 'Хошимин' },
	{ value: 'Asia/Bangkok', label: 'Бангкок' },
	{ value: 'Asia/Jakarta', label: 'Джакарта' },
	{ value: 'Asia/Singapore', label: 'Сингапур' },
	{ value: 'Asia/Tokyo', label: 'Токио' },
	{ value: 'Asia/Yekaterinburg', label: 'Екатеринбург' },
	{ value: 'Asia/Novosibirsk', label: 'Новосибирск' },
	{ value: 'Asia/Krasnoyarsk', label: 'Красноярск' },
	{ value: 'Asia/Irkutsk', label: 'Иркутск' },
	{ value: 'Asia/Yakutsk', label: 'Якутск' },
	{ value: 'Asia/Vladivostok', label: 'Владивосток' },
	{ value: 'Asia/Magadan', label: 'Магадан' },
	{ value: 'Asia/Kamchatka', label: 'Камчатка' },
	{ value: 'America/New_York', label: 'Нью-Йорк' },
	{ value: 'America/Chicago', label: 'Чикаго' },
	{ value: 'America/Denver', label: 'Денвер' },
	{ value: 'America/Los_Angeles', label: 'Лос-Анджелес' },
	{ value: 'America/Sao_Paulo', label: 'Сан-Паулу' },
	{ value: 'Australia/Sydney', label: 'Сидней' }
];

let timezone = DEFAULT_TIMEZONE;

export function setTimezone(next: string): void {
	if (isValidTimezone(next)) timezone = next;
}

export function getTimezone(): string {
	return timezone;
}

export function isValidTimezone(value: string): boolean {
	if (!value) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

export function timezoneLabel(value: string): string {
	return TIMEZONES.find((t) => t.value === value)?.label ?? value;
}

export function timezoneOffsetLabel(value: string): string {
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: value,
			timeZoneName: 'shortOffset'
		}).formatToParts(new Date());
		const offset = parts.find((p) => p.type === 'timeZoneName')?.value;
		return offset ? ` (${offset})` : '';
	} catch {
		return '';
	}
}
