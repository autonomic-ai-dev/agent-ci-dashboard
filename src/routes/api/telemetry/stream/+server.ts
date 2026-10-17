import type { RequestHandler } from './$types';
import { telemetryStore } from '$lib/server/telemetry';

export const GET: RequestHandler = () => {
	let unsubscribe: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send initial connected event
			controller.enqueue(
				encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: Date.now() })}\n\n`)
			);

			// Subscribe to real-time events from telemetry store
			unsubscribe = telemetryStore.subscribe((event) => {
				try {
					const msg = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
					controller.enqueue(encoder.encode(msg));
				} catch {
					// Client disconnected or write failed
				}
			});

			// Heartbeat keep-alive every 15 seconds
			const interval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': heartbeat\n\n'));
				} catch {
					clearInterval(interval);
				}
			}, 15000);

			return () => {
				clearInterval(interval);
				if (unsubscribe) {
					unsubscribe();
				}
			};
		},
		cancel() {
			if (unsubscribe) {
				unsubscribe();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
