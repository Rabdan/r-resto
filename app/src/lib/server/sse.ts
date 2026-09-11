const encoder = new TextEncoder();

type SseClient = {
	controller: ReadableStreamDefaultController<Uint8Array>;
	deviceUuid: string;
};

const clients = new Set<SseClient>();

export type SseEventName =
	| 'DEVICE_ACTIVATED'
	| 'DEVICE_BLOCKED'
	| 'MENU_UPDATED'
	| 'PRECHECK_CREATED'
	| 'PRECHECK_UPDATED'
	| 'PRECHECK_CANCELLED'
	| 'PRECHECK_CLOSED'
	| 'ITEM_STATUS_CHANGED'
	| 'SHIFT_OPENED'
	| 'SHIFT_CLOSED';

export function addSseClient(
	controller: ReadableStreamDefaultController<Uint8Array>,
	deviceUuid: string
): SseClient {
	const client = { controller, deviceUuid };
	clients.add(client);
	return client;
}

export function removeSseClient(client: SseClient): void {
	clients.delete(client);
}

export function broadcast(event: SseEventName, data: unknown, deviceUuid?: string): void {
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	const bytes = encoder.encode(payload);
	for (const client of [...clients]) {
		if (deviceUuid && client.deviceUuid !== deviceUuid) continue;
		try {
			client.controller.enqueue(bytes);
		} catch {
			clients.delete(client);
		}
	}
}

export function sseHeartbeat(): void {
	const bytes = encoder.encode(`: ping\n\n`);
	for (const client of [...clients]) {
		try {
			client.controller.enqueue(bytes);
		} catch {
			clients.delete(client);
		}
	}
}
