import type { RequestHandler } from './$types';
import { addSseClient, removeSseClient } from '$lib/server/sse';

const encoder = new TextEncoder();

export const GET: RequestHandler = ({ locals }) => {
	const uuid = locals.deviceUuid;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let client: ReturnType<typeof addSseClient> | undefined;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			client = addSseClient(controller, uuid);
			controller.enqueue(encoder.encode(`event: hello\ndata: ${JSON.stringify({ uuid })}\n\n`));
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(`: ping\n\n`));
				} catch {
					if (heartbeat) clearInterval(heartbeat);
				}
			}, 15_000);
		},
		cancel() {
			if (heartbeat) clearInterval(heartbeat);
			if (client) removeSseClient(client);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
};
