import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
	connection_mode: 'local_active' | 'cloud_standby';
	connection_status: string;
}

export const GET: RequestHandler = async () => {
	// Check if local heart database exists on current host
	const localDbPath = path.join(os.homedir(), '.autonomic', 'state', 'heart', 'heart.db');
	const localDbExists = fs.existsSync(localDbPath);

	// Option C: Clean zero-state baseline awaiting live agent telemetry
	const data: UsageSummaryResponse = {
		today_spend_usd: 0.0,
		today_turns: 0,
		month_spend_usd: 0.0,
		budget_ceiling_usd: 100.0,
		budget_utilization_pct: 0.0,
		burn_rate_daily_usd: 0.0,
		projected_month_end_usd: 0.0,
		fleet_cache_hit_pct: 0.0,
		fleet_dollars_saved: 0.0,
		quotas: [
			{
				provider: 'Anthropic',
				tier: 'Claude Code (5h rolling)',
				utilization_pct: 0.0,
				reset_in: 'Standby'
			},
			{
				provider: 'OpenAI',
				tier: 'Tier 4 (TPM)',
				utilization_pct: 0.0,
				reset_in: 'Standby'
			},
			{
				provider: 'Google Gemini',
				tier: 'Pay-as-you-go',
				utilization_pct: 0.0,
				reset_in: 'Standby'
			}
		],
		organ_breakdown: [],
		model_breakdown: [],
		last_synced_at: new Date().toISOString(),
		connection_mode: localDbExists ? 'local_active' : 'cloud_standby',
		connection_status: localDbExists
			? 'Local database detected (~/.autonomic/state/heart/heart.db) — awaiting first recorded model turn'
			: 'Cloud Standby — awaiting local agent telemetry sync or cloud NATS broker bridge'
	};

	return json(data);
};
