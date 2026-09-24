import { READY_VISIBLE_MS } from '$lib/item-ready';

export type ToastKind = 'info' | 'success' | 'warn';
export type PosToast = { id: number; kind: ToastKind; title: string; body?: string };

export const toasts = $state<PosToast[]>([]);

let nextId = 1;
let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

function ensureAudio(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	if (!audioCtx) audioCtx = new Ctor();
	return audioCtx;
}

export function unlockAudio(): void {
	if (audioUnlocked) return;
	const ctx = ensureAudio();
	if (!ctx) return;
	audioUnlocked = true;
	void ctx.resume().catch(() => {});
}

if (typeof window !== 'undefined') {
	window.addEventListener(
		'pointerdown',
		() => {
			unlockAudio();
		},
		{ capture: true, once: true }
	);
	window.addEventListener('keydown', () => unlockAudio(), { capture: true, once: true });
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, volume = 0.12) {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(0, start);
	gain.gain.linearRampToValueAtTime(volume, start + 0.02);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(start);
	osc.stop(start + duration);
}

function playChime(kind: ToastKind): void {
	const ctx = ensureAudio();
	if (!ctx) return;
	if (ctx.state === 'suspended') void ctx.resume();
	const t = ctx.currentTime;
	if (kind === 'success') {
		tone(ctx, 880, t, 0.16);
		tone(ctx, 1174.66, t + 0.12, 0.22);
	} else if (kind === 'warn') {
		tone(ctx, 440, t, 0.2, 0.14);
		tone(ctx, 440, t + 0.22, 0.2, 0.14);
	} else {
		tone(ctx, 659.25, t, 0.14);
		tone(ctx, 783.99, t + 0.12, 0.2);
	}
}

function dismiss(id: number): void {
	const idx = toasts.findIndex((t) => t.id === id);
	if (idx >= 0) toasts.splice(idx, 1);
}

export function notify(
	title: string,
	opts: { body?: string; kind?: ToastKind; sound?: boolean; vibrate?: boolean } = {}
): void {
	const { body, kind = 'info', sound = true, vibrate: doVibrate = true } = opts;
	const id = nextId++;
	toasts.push({ id, kind, title, body });
	if (doVibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
		try {
			navigator.vibrate(200);
		} catch {
			/* ignore */
		}
	}
	if (sound) playChime(kind);
	setTimeout(() => dismiss(id), 4500);
}

const readyTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function scheduleOrderReadyToast(orderId: number, number: number | null | undefined): void {
	cancelOrderReadyToast(orderId);
	const timer = setTimeout(() => {
		readyTimers.delete(orderId);
		notify(`Заказ №${number ?? orderId} готов`, { kind: 'success' });
	}, READY_VISIBLE_MS);
	readyTimers.set(orderId, timer);
}

export function cancelOrderReadyToast(orderId: number): void {
	const timer = readyTimers.get(orderId);
	if (timer) {
		clearTimeout(timer);
		readyTimers.delete(orderId);
	}
}
