import { readFileSync } from 'node:fs';
import { connect, credsAuthenticator, type NatsConnection } from '@nats-io/transport-node';
import { telemetryStore } from './telemetry';
import { parseQuota, parseUsageEvent } from './usage-summary';

const RETRY_INTERVAL_MS = 30_000;

export type NatsBridgeStatus = 'not_configured' | 'connecting' | 'connected' | 'disconnected';

let status: NatsBridgeStatus = 'not_configured';
let inFlight: Promise<void> | null = null;
let lastAttemptMs = 0;

export function getNatsBridgeStatus(): NatsBridgeStatus {
	return status;
}

export function startNatsUsageBridge(): Promise<void> {
	const url = process.env.AUTONOMIC_NATS_URL;
	if (!url) {
		status = 'not_configured';
		return Promise.resolve();
	}
	if (status === 'connected' || status === 'connecting') {
		return inFlight ?? Promise.resolve();
	}
	if (Date.now() - lastAttemptMs < RETRY_INTERVAL_MS) {
		return Promise.resolve();
	}
	lastAttemptMs = Date.now();
	status = 'connecting';
	inFlight = openConnection(url, process.env.AUTONOMIC_NATS_CREDS);
	return inFlight;
}

async function openConnection(url: string, credsPath: string | undefined): Promise<void> {
	try {
		const nc = await connect({
			servers: url,
			...(credsPath ? { authenticator: credsAuthenticator(readFileSync(credsPath)) } : {})
		});
		status = 'connected';
		void consume(nc, 'events.heart.usage', (payload) => {
			const event = parseUsageEvent(payload);
			if (event) telemetryStore.ingest({ events: [event] });
			return event !== null;
		});
		void consume(nc, 'events.heart.quota', (payload) => {
			const quota = parseQuota(payload, Date.now());
			if (quota) telemetryStore.ingest({ quotas: [quota] });
			return quota !== null;
		});
		void nc.closed().then(() => {
			status = 'disconnected';
		});
	} catch (err: unknown) {
		status = 'disconnected';
		const reason = err instanceof Error ? err.message : 'unknown error';
		console.error(`usage NATS bridge could not connect: ${reason}`);
	}
}

async function consume(
	nc: NatsConnection,
	subject: string,
	handle: (payload: unknown) => boolean
): Promise<void> {
	const decoder = new TextDecoder();
	for await (const msg of nc.subscribe(subject)) {
		let payload: unknown;
		try {
			payload = JSON.parse(decoder.decode(msg.data));
		} catch {
			console.warn(`usage NATS bridge dropped non-JSON message on ${subject}`);
			continue;
		}
		if (!handle(payload)) {
			console.warn(`usage NATS bridge dropped invalid message on ${subject}`);
		}
	}
}
