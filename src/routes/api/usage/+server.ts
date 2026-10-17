import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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
}

export const GET: RequestHandler = async () => {
	const data: UsageSummaryResponse = {
		today_spend_usd: 3.42,
		today_turns: 42,
		month_spend_usd: 48.20,
		budget_ceiling_usd: 100.00,
		budget_utilization_pct: 48.2,
		burn_rate_daily_usd: 2.85,
		projected_month_end_usd: 85.50,
		fleet_cache_hit_pct: 78.4,
		fleet_dollars_saved: 14.85,
		quotas: [
			{
				provider: 'Anthropic',
				tier: 'Claude Code (5h rolling)',
				utilization_pct: 64.0,
				reset_in: '1h 48m'
			},
			{
				provider: 'OpenAI',
				tier: 'Tier 4 (TPM)',
				utilization_pct: 22.5,
				reset_in: '35s'
			},
			{
				provider: 'Google Gemini',
				tier: 'Pay-as-you-go',
				utilization_pct: 8.2,
				reset_in: 'Daily 00:00 UTC'
			}
		],
		organ_breakdown: [
			{ organ: 'agent-brain', cost_usd: 18.40, pct_of_total: 38.2 },
			{ organ: 'agent-spine', cost_usd: 14.10, pct_of_total: 29.3 },
			{ organ: 'agent-body', cost_usd: 9.80, pct_of_total: 20.3 },
			{ organ: 'agent-heart', cost_usd: 3.90, pct_of_total: 8.1 },
			{ organ: 'agent-tui', cost_usd: 2.00, pct_of_total: 4.1 }
		],
		model_breakdown: [
			{
				model: 'claude-3-7-sonnet',
				provider: 'Anthropic',
				turns: 18,
				total_tokens: 2_450_000,
				prompt_tokens: 650_000,
				completion_tokens: 80_000,
				cache_read_tokens: 1_720_000,
				cost_usd: 24.80,
				dollars_saved: 9.20,
				cache_hit_pct: 79.2
			},
			{
				model: 'claude-3-5-sonnet',
				provider: 'Anthropic',
				turns: 14,
				total_tokens: 1_820_000,
				prompt_tokens: 520_000,
				completion_tokens: 65_000,
				cache_read_tokens: 1_235_000,
				cost_usd: 16.10,
				dollars_saved: 4.30,
				cache_hit_pct: 74.5
			},
			{
				model: 'gpt-4o',
				provider: 'OpenAI',
				turns: 6,
				total_tokens: 850_000,
				prompt_tokens: 380_000,
				completion_tokens: 45_000,
				cache_read_tokens: 425_000,
				cost_usd: 5.10,
				dollars_saved: 1.15,
				cache_hit_pct: 50.0
			},
			{
				model: 'gpt-4o-mini',
				provider: 'OpenAI',
				turns: 4,
				total_tokens: 620_000,
				prompt_tokens: 220_000,
				completion_tokens: 40_000,
				cache_read_tokens: 360_000,
				cost_usd: 0.80,
				dollars_saved: 0.20,
				cache_hit_pct: 62.0
			}
		],
		last_synced_at: new Date().toISOString()
	};

	return json(data);
};
