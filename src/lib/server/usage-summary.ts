import type { IngestedModelUsageEvent, IngestedProviderQuota } from './telemetry';

const CACHE_RATE_USD_PER_MTOK = 2.25;
const EPOCH_SECONDS_THRESHOLD = 100_000_000_000;

export interface ModelUsageStat {
	model: string;
	provider: string;
	turns: number;
	total_tokens: number;
	prompt_tokens: number;
	completion_tokens: number;
	cache_read_tokens: number;
	cost_usd: number;
	dollars_saved: number;
	cache_hit_pct: number;
}

export interface OrganCostStat {
	organ: string;
	cost_usd: number;
	pct_of_total: number;
}

export interface QuotaStat {
	provider: string;
	tier: string;
	utilization_pct: number;
	reset_in: string;
}

export interface UsageSummaryResponse {
	today_spend_usd: number;
	today_turns: number;
	month_spend_usd: number;
	budget_ceiling_usd: number;
	budget_utilization_pct: number;
	burn_rate_daily_usd: number;
	projected_month_end_usd: number;
	fleet_cache_hit_pct: number;
	fleet_dollars_saved: number;
	quotas: QuotaStat[];
	organ_breakdown: OrganCostStat[];
	model_breakdown: ModelUsageStat[];
	last_synced_at: string;
	connection_mode: 'nats_live' | 'api_ingest' | 'standby';
	connection_status: string;
}

export interface SummaryOptions {
	now: Date;
	budgetCeilingUsd: number;
	natsStatus: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function parseUsageEvent(value: unknown): IngestedModelUsageEvent | null {
	if (!isRecord(value)) return null;
	const {
		id,
		timestamp,
		organ,
		provider,
		model,
		estimated_cost_usd,
		prompt_tokens,
		completion_tokens
	} = value;
	if (
		typeof id !== 'string' ||
		typeof organ !== 'string' ||
		typeof provider !== 'string' ||
		typeof model !== 'string' ||
		!isFiniteNumber(timestamp) ||
		!isFiniteNumber(estimated_cost_usd) ||
		!isFiniteNumber(prompt_tokens) ||
		!isFiniteNumber(completion_tokens)
	) {
		return null;
	}
	return {
		id,
		timestamp,
		organ,
		provider,
		model,
		estimated_cost_usd,
		prompt_tokens,
		completion_tokens,
		session_id: typeof value.session_id === 'string' ? value.session_id : undefined,
		billing_type: typeof value.billing_type === 'string' ? value.billing_type : undefined,
		cache_read_tokens: isFiniteNumber(value.cache_read_tokens) ? value.cache_read_tokens : 0,
		cache_write_tokens: isFiniteNumber(value.cache_write_tokens) ? value.cache_write_tokens : 0,
		latency_ms: isFiniteNumber(value.latency_ms) ? value.latency_ms : undefined
	};
}

export function parseQuota(value: unknown, now: number): IngestedProviderQuota | null {
	if (!isRecord(value)) return null;
	const { provider, window_type, utilization_pct } = value;
	if (
		typeof provider !== 'string' ||
		typeof window_type !== 'string' ||
		!isFiniteNumber(utilization_pct)
	) {
		return null;
	}
	return {
		provider,
		window_type,
		account_or_tier: typeof value.account_or_tier === 'string' ? value.account_or_tier : '',
		utilization_pct,
		reset_at: isFiniteNumber(value.reset_at) ? value.reset_at : null,
		rate_limit_remaining: isFiniteNumber(value.rate_limit_remaining)
			? value.rate_limit_remaining
			: null,
		updated_at: isFiniteNumber(value.updated_at) ? value.updated_at : now
	};
}

function sumOf<T>(items: T[], pick: (item: T) => number): number {
	return items.reduce((total, item) => total + pick(item), 0);
}

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		groups.set(k, [...(groups.get(k) ?? []), item]);
	}
	return [...groups.values()];
}

function cacheDollars(cacheTokens: number): number {
	return (cacheTokens / 1_000_000) * CACHE_RATE_USD_PER_MTOK;
}

function cacheHitPct(promptTokens: number, cacheTokens: number): number {
	const inputTokens = promptTokens + cacheTokens;
	return inputTokens > 0 ? (cacheTokens / inputTokens) * 100 : 0;
}

function clampPct(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function modelStat(group: IngestedModelUsageEvent[]): ModelUsageStat {
	const first = group[0];
	const promptTokens = sumOf(group, (e) => e.prompt_tokens);
	const completionTokens = sumOf(group, (e) => e.completion_tokens);
	const cacheTokens = sumOf(group, (e) => e.cache_read_tokens ?? 0);
	return {
		model: first.model,
		provider: first.provider,
		turns: group.length,
		total_tokens: promptTokens + completionTokens + cacheTokens,
		prompt_tokens: promptTokens,
		completion_tokens: completionTokens,
		cache_read_tokens: cacheTokens,
		cost_usd: sumOf(group, (e) => e.estimated_cost_usd),
		dollars_saved: cacheDollars(cacheTokens),
		cache_hit_pct: cacheHitPct(promptTokens, cacheTokens)
	};
}

function resetIn(resetAt: number | null, now: Date): string {
	if (resetAt === null) return 'No active window';
	const resetMs = resetAt < EPOCH_SECONDS_THRESHOLD ? resetAt * 1000 : resetAt;
	const remainingMin = Math.floor((resetMs - now.getTime()) / 60_000);
	if (remainingMin <= 0) return 'Resetting...';
	const hours = Math.floor(remainingMin / 60);
	const minutes = remainingMin % 60;
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function quotaStat(quota: IngestedProviderQuota, now: Date): QuotaStat {
	return {
		provider: quota.provider,
		tier: quota.account_or_tier,
		utilization_pct: clampPct(quota.utilization_pct),
		reset_in: resetIn(quota.reset_at ?? null, now)
	};
}

export function summarizeUsage(
	events: IngestedModelUsageEvent[],
	quotas: IngestedProviderQuota[],
	options: SummaryOptions
): UsageSummaryResponse {
	const { now, budgetCeilingUsd, natsStatus } = options;
	const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
	const todayEvents = events.filter((e) => e.timestamp >= dayStart);
	const monthEvents = events.filter((e) => e.timestamp >= monthStart);

	const monthSpend = sumOf(monthEvents, (e) => e.estimated_cost_usd);
	const dayOfMonth = now.getUTCDate();
	const daysInMonth = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
	).getUTCDate();
	const burnRate = monthSpend / dayOfMonth;
	const totalCost = sumOf(events, (e) => e.estimated_cost_usd);
	const promptTokens = sumOf(events, (e) => e.prompt_tokens);
	const cacheTokens = sumOf(events, (e) => e.cache_read_tokens ?? 0);

	const organBreakdown = groupBy(events, (e) => e.organ)
		.map((group) => {
			const cost = sumOf(group, (e) => e.estimated_cost_usd);
			return {
				organ: group[0].organ,
				cost_usd: cost,
				pct_of_total: totalCost > 0 ? (cost / totalCost) * 100 : 0
			};
		})
		.sort((a, b) => b.cost_usd - a.cost_usd);

	const modelBreakdown = groupBy(events, (e) => `${e.provider}|${e.model}`)
		.map(modelStat)
		.sort((a, b) => b.cost_usd - a.cost_usd);

	const connected = natsStatus === 'connected';
	const hasEvents = events.length > 0;

	return {
		today_spend_usd: sumOf(todayEvents, (e) => e.estimated_cost_usd),
		today_turns: todayEvents.length,
		month_spend_usd: monthSpend,
		budget_ceiling_usd: budgetCeilingUsd,
		budget_utilization_pct:
			budgetCeilingUsd > 0 ? Math.min(100, (monthSpend / budgetCeilingUsd) * 100) : 0,
		burn_rate_daily_usd: burnRate,
		projected_month_end_usd: monthSpend + burnRate * (daysInMonth - dayOfMonth),
		fleet_cache_hit_pct: cacheHitPct(promptTokens, cacheTokens),
		fleet_dollars_saved: cacheDollars(cacheTokens),
		quotas: quotas.map((quota) => quotaStat(quota, now)),
		organ_breakdown: organBreakdown,
		model_breakdown: modelBreakdown,
		last_synced_at: now.toISOString(),
		connection_mode: connected ? 'nats_live' : hasEvents ? 'api_ingest' : 'standby',
		connection_status: connected
			? 'Live NATS subscription on events.heart.usage and events.heart.quota'
			: hasEvents
				? 'Showing events received through the telemetry API'
				: `Waiting for telemetry (NATS ${natsStatus})`
	};
}
