import { goto } from '$app/navigation';
import { deviceHasRole, type DeviceSession, type UserRole } from '$lib/types';

export const POS_SESSION_KEY = 'pos-session';

export type PosSessionStatus = 'idle' | 'loading' | 'ready' | 'denied';

export type PosSseEventName =
	| 'DEVICE_ACTIVATED'
	| 'DEVICE_BLOCKED'
	| 'MENU_UPDATED'
	| 'ORDER_CREATED'
	| 'ORDER_UPDATED'
	| 'ORDER_CANCELLED'
	| 'ORDER_CLOSED'
	| 'ORDER_READY'
	| 'ORDER_FIRED'
	| 'ITEM_STATUS_CHANGED'
	| 'SHIFT_OPENED'
	| 'SHIFT_CLOSED';

export type PosSseHandler = (ev: MessageEvent) => void;

export type PosSessionState = {
	device: DeviceSession | null;
	status: PosSessionStatus;
	error: string | null;
};

const SSE_EVENTS: PosSseEventName[] = [
	'DEVICE_ACTIVATED',
	'DEVICE_BLOCKED',
	'MENU_UPDATED',
	'ORDER_CREATED',
	'ORDER_UPDATED',
	'ORDER_CANCELLED',
	'ORDER_CLOSED',
	'ORDER_READY',
	'ORDER_FIRED',
	'ITEM_STATUS_CHANGED',
	'SHIFT_OPENED',
	'SHIFT_CLOSED'
];

export const posSession: PosSessionState = $state({
	device: null,
	status: 'idle',
	error: null
});

const listeners = new Map<PosSseEventName, Set<PosSseHandler>>();
const connectListeners = new Set<() => void>();

let source: EventSource | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let backoffMs = 1000;
let generation = 0;
let running = false;
let currentRole: UserRole | null = null;

export async function refreshMe(): Promise<DeviceSession | null> {
	try {
		const res = await fetch('/api/devices/me');
		if (!res.ok) {
			posSession.device = null;
			posSession.error = 'Не удалось получить устройство';
			return null;
		}
		const data = (await res.json()) as { device: DeviceSession | null };
		posSession.device = data.device;
		posSession.error = null;
		return data.device;
	} catch {
		posSession.device = null;
		posSession.error = 'Нет связи';
		return null;
	}
}

export async function startPosSession(role: UserRole): Promise<void> {
	const gen = ++generation;
	running = true;
	currentRole = role;
	posSession.status = 'loading';
	posSession.error = null;

	const device = await refreshMe();
	if (gen !== generation) return;

	if (device?.status !== 'active' || !deviceHasRole(device, role)) {
		posSession.status = 'denied';
		await goto('/');
		return;
	}

	posSession.status = 'ready';
	connectEvents();
}

export function stopPosSession(): void {
	generation += 1;
	running = false;
	currentRole = null;
	posSession.status = 'idle';
	clearReconnect();
	source?.close();
	source = undefined;
}

export function onPosEvent(event: PosSseEventName, handler: PosSseHandler): () => void {
	let set = listeners.get(event);
	if (!set) {
		set = new Set();
		listeners.set(event, set);
	}
	set.add(handler);
	return () => {
		set.delete(handler);
		if (set.size === 0) listeners.delete(event);
	};
}

/** Вызывается при каждом (пере)подключении SSE — для перезагрузки данных после разрыва. */
export function onPosConnect(handler: () => void): () => void {
	connectListeners.add(handler);
	return () => {
		connectListeners.delete(handler);
	};
}

function dispatch(event: PosSseEventName, ev: MessageEvent): void {
	const set = listeners.get(event);
	if (!set) return;
	for (const handler of set) handler(ev);
}

function clearReconnect(): void {
	if (reconnectTimer !== undefined) {
		clearTimeout(reconnectTimer);
		reconnectTimer = undefined;
	}
}

function connectEvents(): void {
	if (!running) return;
	clearReconnect();
	source?.close();
	const es = new EventSource('/api/events');
	source = es;
	es.onopen = () => {
		backoffMs = 1000;
		for (const handler of [...connectListeners]) handler();
	};
	for (const name of SSE_EVENTS) {
		es.addEventListener(name, (ev) => {
			if (source !== es) return;
			const message = ev as MessageEvent;
			if (name === 'DEVICE_BLOCKED') {
				posSession.status = 'denied';
				posSession.device = null;
				void goto('/');
			}
			if (name === 'DEVICE_ACTIVATED') {
				void refreshMe().then((device) => {
					if (!running || !currentRole) return;
					if (device?.status !== 'active' || !deviceHasRole(device, currentRole)) {
						posSession.status = 'denied';
						void goto('/');
					}
				});
			}
			dispatch(name, message);
		});
	}
	es.onerror = () => {
		if (source !== es) return;
		clearReconnect();
		es.close();
		if (source === es) source = undefined;
		if (!running) return;
		reconnectTimer = setTimeout(() => {
			backoffMs = Math.min(backoffMs * 2, 15000);
			connectEvents();
		}, backoffMs);
	};
}
