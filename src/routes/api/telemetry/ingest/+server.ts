import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { telemetryStore, type TelemetryBatchPayload } from '$lib/server/telemetry';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const payload = (await request.json()) as TelemetryBatchPayload;
		if (!payload || typeof payload !== 'object') {
			return json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
		}

		const result = telemetryStore.ingest(payload);
		return json({
			success: true,
			...result,
			received_at: new Date().toISOString()
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Unknown ingestion error';
		return json({ success: false, error: message }, { status: 500 });
	}
};

export const GET: RequestHandler = async () => {
	const recent = telemetryStore.getRecentEvents(10);
	const quotas = telemetryStore.getActiveQuotas();
	return json({
		status: 'active',
		cached_events: recent.length,
		active_quotas: quotas.length,
		recent_events: recent,
		quotas
	});
};
