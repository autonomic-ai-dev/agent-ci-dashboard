import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { telemetryStore } from '$lib/server/telemetry';
import { getNatsBridgeStatus, startNatsUsageBridge } from '$lib/server/usage-nats';
import { summarizeUsage } from '$lib/server/usage-summary';

export type {
	ModelUsageStat,
	OrganCostStat,
	QuotaStat,
	UsageSummaryResponse
} from '$lib/server/usage-summary';

const NATS_CONNECT_WAIT_MS = 3000;
const DEFAULT_MONTHLY_BUDGET_USD = 100;

function monthlyBudgetUsd(): number {
	const configured = Number(process.env.AUTONOMIC_MONTHLY_BUDGET_USD);
	return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MONTHLY_BUDGET_USD;
}

export const GET: RequestHandler = async () => {
	await Promise.race([
		startNatsUsageBridge(),
		new Promise((resolve) => setTimeout(resolve, NATS_CONNECT_WAIT_MS))
	]);

	const summary = summarizeUsage(telemetryStore.getEvents(), telemetryStore.getActiveQuotas(), {
		now: new Date(),
		budgetCeilingUsd: monthlyBudgetUsd(),
		natsStatus: getNatsBridgeStatus()
	});

	return json(summary);
};
