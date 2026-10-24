export interface IngestedModelUsageEvent {
	id: string;
	timestamp: number;
	session_id?: string;
	organ: string;
	provider: string;
	model: string;
	billing_type?: string;
	prompt_tokens: number;
	completion_tokens: number;
	cache_read_tokens?: number;
	cache_write_tokens?: number;
	estimated_cost_usd: number;
	latency_ms?: number;
}

export interface IngestedProviderQuota {
	provider: string;
	account_or_tier: string;
	window_type: string;
	utilization_pct: number;
	reset_at?: number | null;
	rate_limit_remaining?: number | null;
	updated_at: number;
}

export interface TelemetryBatchPayload {
	events?: IngestedModelUsageEvent[];
	quotas?: IngestedProviderQuota[];
	source?: string;
	timestamp?: number;
}

type Subscriber = (data: { type: string; payload: unknown }) => void;

class TelemetryStore {
	private events: IngestedModelUsageEvent[] = [];
	private quotas: Map<string, IngestedProviderQuota> = new Map();
	private subscribers: Set<Subscriber> = new Set();
	private maxEvents = 10000;

	public ingest(batch: TelemetryBatchPayload): {
		ingested_events: number;
		ingested_quotas: number;
	} {
		let eventCount = 0;
		if (batch.events && Array.isArray(batch.events)) {
			for (const evt of batch.events) {
				if (this.events.some((existing) => existing.id === evt.id)) continue;
				this.events.unshift(evt);
				eventCount++;
				this.broadcast({ type: 'usage_event', payload: evt });
			}
			if (this.events.length > this.maxEvents) {
				this.events = this.events.slice(0, this.maxEvents);
			}
		}

		let quotaCount = 0;
		if (batch.quotas && Array.isArray(batch.quotas)) {
			for (const q of batch.quotas) {
				const key = `${q.provider}:${q.window_type}`;
				this.quotas.set(key, q);
				quotaCount++;
				this.broadcast({ type: 'quota_snapshot', payload: q });
			}
		}

		return {
			ingested_events: eventCount,
			ingested_quotas: quotaCount
		};
	}

	public getRecentEvents(limit = 50): IngestedModelUsageEvent[] {
		return this.events.slice(0, limit);
	}

	public getEvents(): IngestedModelUsageEvent[] {
		return [...this.events];
	}

	public getActiveQuotas(): IngestedProviderQuota[] {
		return Array.from(this.quotas.values());
	}

	public subscribe(sub: Subscriber): () => void {
		this.subscribers.add(sub);
		return () => {
			this.subscribers.delete(sub);
		};
	}

	private broadcast(data: { type: string; payload: unknown }) {
		for (const sub of this.subscribers) {
			try {
				sub(data);
			} catch {
				// ignore failed client sends
			}
		}
	}
}

export const telemetryStore = new TelemetryStore();
