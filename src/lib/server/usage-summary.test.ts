import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuota, parseUsageEvent, summarizeUsage } from './usage-summary.ts';
import type { IngestedModelUsageEvent } from './telemetry.ts';

const NOW = new Date(Date.UTC(2026, 9, 18, 12));
const OPTIONS = { now: NOW, budgetCeilingUsd: 100, natsStatus: 'connected' };

function event(overrides: Partial<IngestedModelUsageEvent>): IngestedModelUsageEvent {
	return {
		id: 'evt',
		timestamp: Date.UTC(2026, 9, 18, 8),
		organ: 'agent-brain',
		provider: 'anthropic',
		model: 'claude-3-7-sonnet',
		prompt_tokens: 0,
		completion_tokens: 0,
		cache_read_tokens: 0,
		estimated_cost_usd: 0,
		...overrides
	};
}

describe('summarizeUsage spend and budget', () => {
	const events = [
		event({
			id: 'today',
			timestamp: Date.UTC(2026, 9, 18, 8),
			estimated_cost_usd: 1,
			prompt_tokens: 1000,
			completion_tokens: 100,
			cache_read_tokens: 9000
		}),
		event({
			id: 'earlier-this-month',
			timestamp: Date.UTC(2026, 9, 3, 10),
			organ: 'agent-muscle',
			provider: 'openai',
			model: 'gpt-4o',
			estimated_cost_usd: 2,
			prompt_tokens: 500,
			completion_tokens: 50
		}),
		event({
			id: 'previous-month',
			timestamp: Date.UTC(2026, 8, 30, 10),
			organ: 'agent-spine',
			estimated_cost_usd: 50
		})
	];

	test('counts today and month separately and ignores previous months for spend', () => {
		const summary = summarizeUsage(events, [], OPTIONS);
		assert.equal(summary.today_spend_usd, 1);
		assert.equal(summary.today_turns, 1);
		assert.equal(summary.month_spend_usd, 3);
	});

	test('projects month end from month-to-date average burn over the remaining days', () => {
		const summary = summarizeUsage(events, [], OPTIONS);
		const burn = 3 / 18;
		assert.ok(Math.abs(summary.burn_rate_daily_usd - burn) < 1e-9);
		assert.ok(Math.abs(summary.projected_month_end_usd - (3 + burn * 13)) < 1e-9);
	});

	test('caps budget utilization at 100 percent', () => {
		const heavy = [event({ id: 'big', timestamp: Date.UTC(2026, 9, 2), estimated_cost_usd: 250 })];
		const summary = summarizeUsage(heavy, [], OPTIONS);
		assert.equal(summary.budget_utilization_pct, 100);
		assert.equal(summary.budget_ceiling_usd, 100);
	});

	test('reports zero utilization when the budget ceiling is not positive', () => {
		const summary = summarizeUsage(events, [], { ...OPTIONS, budgetCeilingUsd: 0 });
		assert.equal(summary.budget_utilization_pct, 0);
	});

	test('returns zeros and standby mode when there are no events', () => {
		const summary = summarizeUsage([], [], { ...OPTIONS, natsStatus: 'disconnected' });
		assert.equal(summary.today_spend_usd, 0);
		assert.equal(summary.month_spend_usd, 0);
		assert.equal(summary.connection_mode, 'standby');
		assert.deepEqual(summary.model_breakdown, []);
		assert.deepEqual(summary.quotas, []);
	});
});

describe('summarizeUsage cache and breakdowns', () => {
	const events = [
		event({
			id: 'a',
			timestamp: Date.UTC(2026, 9, 18, 8),
			estimated_cost_usd: 1,
			prompt_tokens: 1000,
			completion_tokens: 100,
			cache_read_tokens: 9000
		}),
		event({
			id: 'b',
			timestamp: Date.UTC(2026, 9, 3, 10),
			organ: 'agent-muscle',
			provider: 'openai',
			model: 'gpt-4o',
			estimated_cost_usd: 2,
			prompt_tokens: 500,
			completion_tokens: 50
		})
	];

	test('computes fleet cache hit rate and dollars saved from cache reads', () => {
		const summary = summarizeUsage(events, [], OPTIONS);
		assert.ok(Math.abs(summary.fleet_cache_hit_pct - (9000 / 10500) * 100) < 1e-9);
		assert.ok(Math.abs(summary.fleet_dollars_saved - (9000 / 1_000_000) * 2.25) < 1e-12);
	});

	test('sorts model breakdown by cost with per-model token totals', () => {
		const summary = summarizeUsage(events, [], OPTIONS);
		assert.deepEqual(
			summary.model_breakdown.map((m) => m.model),
			['gpt-4o', 'claude-3-7-sonnet']
		);
		const claude = summary.model_breakdown.find((m) => m.model === 'claude-3-7-sonnet');
		assert.equal(claude?.total_tokens, 10100);
		assert.equal(claude?.turns, 1);
	});

	test('reports organ share of all-time cost', () => {
		const summary = summarizeUsage(events, [], OPTIONS);
		const muscle = summary.organ_breakdown.find((o) => o.organ === 'agent-muscle');
		assert.equal(muscle?.cost_usd, 2);
		assert.ok(Math.abs((muscle?.pct_of_total ?? 0) - (2 / 3) * 100) < 1e-9);
	});

	test('marks live mode when NATS is connected and api mode when only ingested events exist', () => {
		assert.equal(summarizeUsage(events, [], OPTIONS).connection_mode, 'nats_live');
		assert.equal(
			summarizeUsage(events, [], { ...OPTIONS, natsStatus: 'disconnected' }).connection_mode,
			'api_ingest'
		);
	});
});

describe('summarizeUsage quotas', () => {
	const quota = (overrides: Record<string, unknown>) => ({
		provider: 'anthropic',
		account_or_tier: 'Claude Pro',
		window_type: '5h',
		utilization_pct: 40,
		reset_at: null,
		updated_at: NOW.getTime(),
		...overrides
	});

	test('formats time until reset for millisecond and second timestamps', () => {
		const resetMs = NOW.getTime() + (2 * 60 + 30) * 60_000;
		const ms = summarizeUsage([], [quota({ reset_at: resetMs })], OPTIONS).quotas[0];
		const sec = summarizeUsage([], [quota({ reset_at: resetMs / 1000 })], OPTIONS).quotas[0];
		assert.equal(ms.reset_in, '2h 30m');
		assert.equal(sec.reset_in, '2h 30m');
	});

	test('shows resetting once the reset time has passed and no window without a reset time', () => {
		const past = NOW.getTime() - 60_000;
		assert.equal(
			summarizeUsage([], [quota({ reset_at: past })], OPTIONS).quotas[0].reset_in,
			'Resetting...'
		);
		assert.equal(summarizeUsage([], [quota({})], OPTIONS).quotas[0].reset_in, 'No active window');
	});

	test('clamps utilization between 0 and 100', () => {
		assert.equal(
			summarizeUsage([], [quota({ utilization_pct: 150 })], OPTIONS).quotas[0].utilization_pct,
			100
		);
		assert.equal(
			summarizeUsage([], [quota({ utilization_pct: -5 })], OPTIONS).quotas[0].utilization_pct,
			0
		);
	});
});

describe('parseUsageEvent', () => {
	test('accepts a complete event and fills optional token counts with zero', () => {
		const parsed = parseUsageEvent({
			id: 'evt-1',
			timestamp: 1700000000000,
			organ: 'agent-brain',
			provider: 'anthropic',
			model: 'claude-3-7-sonnet',
			prompt_tokens: 10,
			completion_tokens: 2,
			estimated_cost_usd: 0.5
		});
		assert.ok(parsed);
		assert.equal(parsed.cache_read_tokens, 0);
		assert.equal(parsed.cache_write_tokens, 0);
	});

	test('rejects non-objects, missing ids and non-numeric costs', () => {
		assert.equal(parseUsageEvent(null), null);
		assert.equal(parseUsageEvent('evt'), null);
		assert.equal(
			parseUsageEvent({
				organ: 'agent-brain',
				provider: 'anthropic',
				model: 'm',
				timestamp: 1,
				prompt_tokens: 1,
				completion_tokens: 1,
				estimated_cost_usd: 1
			}),
			null
		);
		assert.equal(
			parseUsageEvent({
				id: 'x',
				organ: 'agent-brain',
				provider: 'anthropic',
				model: 'm',
				timestamp: 1,
				prompt_tokens: 1,
				completion_tokens: 1,
				estimated_cost_usd: 'free'
			}),
			null
		);
	});
});

describe('parseQuota', () => {
	test('rejects quotas without a provider or utilization', () => {
		assert.equal(parseQuota({ window_type: '5h', utilization_pct: 10 }, 1), null);
		assert.equal(parseQuota({ provider: 'anthropic', window_type: '5h' }, 1), null);
	});

	test('defaults account tier, reset and update time', () => {
		const parsed = parseQuota({ provider: 'openai', window_type: 'tpm', utilization_pct: 24 }, 99);
		assert.ok(parsed);
		assert.equal(parsed.account_or_tier, '');
		assert.equal(parsed.reset_at, null);
		assert.equal(parsed.updated_at, 99);
	});
});
