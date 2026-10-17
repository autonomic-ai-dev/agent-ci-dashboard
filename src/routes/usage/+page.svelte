<script lang="ts">
	import {
		DollarSign,
		Flame,
		ShieldCheck,
		Cpu,
		Layers,
		Zap,
		Clock,
		ArrowUpRight,
		RefreshCw,
		CheckCircle2
	} from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let usage = $derived(data.usage);

	function formatCurrency(val: number): string {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
	}

	function formatTokens(val: number): string {
		if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
		if (val >= 1_000) return (val / 1_000).toFixed(1) + 'k';
		return val.toString();
	}
</script>

<svelte:head>
	<title>Usage & Budget Governance | Autonomic AI</title>
</svelte:head>

<div class="px-4 sm:px-8 py-8 max-w-7xl mx-auto space-y-8">
	<!-- Page Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
		<div>
			<div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[11px] font-mono mb-2">
				<span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
				FLEET TELEMETRY & BUDGET GOVERNANCE
			</div>
			<h1 class="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">Model Usage & Budget HUD</h1>
			<p class="text-slate-400 text-sm mt-1">Real-time LLM token consumption, sliding quota enforcement, and prompt cache attribution.</p>
		</div>

		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161b22] border border-white/10 text-xs font-mono text-slate-300">
				<Clock size={13} class="text-slate-400" />
				<span>Synced: {new Date(usage.last_synced_at).toLocaleTimeString()}</span>
			</div>
			<a
				href="/api/usage"
				target="_blank"
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-mono text-cyan-300 transition-colors"
			>
				<span>Raw Telemetry</span>
				<ArrowUpRight size={13} />
			</a>
		</div>
	</div>

	<!-- Top 3 Mission Control Metric Cards -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
		<!-- Card 1: Today's Spend -->
		<div class="rounded-xl bg-[#0d1117]/80 border border-white/[0.08] p-5 relative overflow-hidden backdrop-blur-sm">
			<div class="flex items-center justify-between text-slate-400 mb-2">
				<span class="text-xs font-mono uppercase tracking-wider">Spend Today</span>
				<div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
					<DollarSign size={16} />
				</div>
			</div>
			<div class="text-3xl font-bold font-mono text-white tracking-tight">
				{formatCurrency(usage.today_spend_usd)}
			</div>
			<div class="mt-3 flex items-center justify-between text-xs font-mono text-slate-400 border-t border-white/[0.06] pt-3">
				<span>Turns Executed:</span>
				<span class="text-slate-200 font-semibold">{usage.today_turns} turns</span>
			</div>
			<div class="mt-1 flex items-center justify-between text-xs font-mono text-slate-400">
				<span>Avg Cost / Turn:</span>
				<span class="text-emerald-400">{formatCurrency(usage.today_spend_usd / Math.max(1, usage.today_turns))}</span>
			</div>
		</div>

		<!-- Card 2: 30-Day Budget Gauge -->
		<div class="rounded-xl bg-[#0d1117]/80 border border-white/[0.08] p-5 relative overflow-hidden backdrop-blur-sm">
			<div class="flex items-center justify-between text-slate-400 mb-2">
				<span class="text-xs font-mono uppercase tracking-wider">30-Day Budget Ceiling</span>
				<div class="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
					<Flame size={16} />
				</div>
			</div>
			<div class="flex items-baseline gap-2">
				<span class="text-3xl font-bold font-mono text-white tracking-tight">{formatCurrency(usage.month_spend_usd)}</span>
				<span class="text-slate-500 text-sm font-mono">/ {formatCurrency(usage.budget_ceiling_usd)}</span>
			</div>
			<!-- Progress Bar -->
			<div class="w-full bg-white/[0.06] rounded-full h-2 mt-3 overflow-hidden">
				<div
					class="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
					style="width: {Math.min(100, usage.budget_utilization_pct)}%"
				></div>
			</div>
			<div class="mt-2 flex items-center justify-between text-xs font-mono">
				<span class="text-cyan-400 font-semibold">{usage.budget_utilization_pct.toFixed(1)}% utilized</span>
				<span class="text-slate-400">Projected: {formatCurrency(usage.projected_month_end_usd)}</span>
			</div>
		</div>

		<!-- Card 3: Cache Savings Ratio -->
		<div class="rounded-xl bg-[#0d1117]/80 border border-white/[0.08] p-5 relative overflow-hidden backdrop-blur-sm">
			<div class="flex items-center justify-between text-slate-400 mb-2">
				<span class="text-xs font-mono uppercase tracking-wider">Fleet Cache Savings</span>
				<div class="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
					<ShieldCheck size={16} />
				</div>
			</div>
			<div class="text-3xl font-bold font-mono text-emerald-400 tracking-tight">
				{usage.fleet_cache_hit_pct.toFixed(1)}%
			</div>
			<div class="mt-3 flex items-center justify-between text-xs font-mono text-slate-400 border-t border-white/[0.06] pt-3">
				<span>Net Dollars Saved:</span>
				<span class="text-emerald-400 font-semibold">+{formatCurrency(usage.fleet_dollars_saved)}</span>
			</div>
			<div class="mt-1 flex items-center justify-between text-xs font-mono text-slate-400">
				<span>Burn Rate / Day:</span>
				<span class="text-slate-200">{formatCurrency(usage.burn_rate_daily_usd)}/day</span>
			</div>
		</div>
	</div>

	<!-- Provider Quotas & Sliding Windows -->
	<div class="rounded-xl bg-[#0d1117]/80 border border-white/[0.08] p-6 backdrop-blur-sm space-y-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Zap size={16} class="text-cyan-400" />
				<h2 class="text-base font-bold font-mono text-white">Active Subscription Quotas & Rate Windows</h2>
			</div>
			<span class="text-xs font-mono text-slate-500">Autonomous Self-Throttling Gate</span>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			{#each usage.quotas as quota}
				<div class="rounded-lg bg-[#161b22]/70 border border-white/[0.06] p-4 space-y-3">
					<div class="flex items-center justify-between">
						<div>
							<div class="font-mono text-sm font-semibold text-white">{quota.provider}</div>
							<div class="font-mono text-xs text-slate-400">{quota.tier}</div>
						</div>
						<span
							class="text-xs font-mono px-2 py-0.5 rounded {quota.utilization_pct > 80
								? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
								: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}"
						>
							{quota.utilization_pct.toFixed(0)}%
						</span>
					</div>

					<div class="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
						<div
							class="h-1.5 rounded-full {quota.utilization_pct > 80 ? 'bg-rose-500' : 'bg-cyan-400'}"
							style="width: {Math.min(100, quota.utilization_pct)}%"
						></div>
					</div>

					<div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
						<span>Window Reset:</span>
						<span class="text-slate-200">{quota.reset_in}</span>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Two Column Layout: Organ Breakdown & Model Efficiency -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Organ Cost Attribution (1 Col) -->
		<div class="rounded-xl bg-[#0d1117]/80 border border-white/[0.08] p-6 backdrop-blur-sm space-y-4">
			<div class="flex items-center gap-2">
				<Layers size={16} class="text-cyan-400" />
				<h2 class="text-base font-bold font-mono text-white">Organ Cost Attribution</h2>
			</div>

			<div class="space-y-4">
				{#each usage.organ_breakdown as organ}
					<div class="space-y-1.5">
						<div class="flex items-center justify-between text-xs font-mono">
							<span class="text-slate-300 font-semibold">{organ.organ}</span>
							<span class="text-slate-400">{formatCurrency(organ.cost_usd)} ({organ.pct_of_total}%)</span>
						</div>
						<div class="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
							<div
								class="bg-cyan-500/80 h-1.5 rounded-full"
								style="width: {organ.pct_of_total}%"
							></div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Model Breakdown & Efficiency (2 Cols) -->
		<div class="lg:col-span-2 rounded-xl bg-[#0d1117]/80 border border-white/[0.08] p-6 backdrop-blur-sm space-y-4 overflow-x-auto">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Cpu size={16} class="text-cyan-400" />
					<h2 class="text-base font-bold font-mono text-white">Model Consumption & Cache Efficiency</h2>
				</div>
				<span class="text-xs font-mono text-slate-500">Tier Token Metrics</span>
			</div>

			<table class="w-full text-left font-mono text-xs">
				<thead class="border-b border-white/[0.08] text-slate-400 uppercase tracking-wider text-[11px]">
					<tr>
						<th class="py-2.5 px-3">Model</th>
						<th class="py-2.5 px-3">Provider</th>
						<th class="py-2.5 px-3 text-right">Turns</th>
						<th class="py-2.5 px-3 text-right">Tokens</th>
						<th class="py-2.5 px-3 text-right">Cache Hit %</th>
						<th class="py-2.5 px-3 text-right">Cost</th>
						<th class="py-2.5 px-3 text-right">Saved</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-white/[0.04]">
					{#each usage.model_breakdown as item}
						<tr class="hover:bg-white/[0.02] transition-colors">
							<td class="py-3 px-3 font-semibold text-slate-100">{item.model}</td>
							<td class="py-3 px-3 text-slate-400">{item.provider}</td>
							<td class="py-3 px-3 text-right text-slate-300">{item.turns}</td>
							<td class="py-3 px-3 text-right text-slate-300">{formatTokens(item.total_tokens)}</td>
							<td class="py-3 px-3 text-right text-cyan-400">{item.cache_hit_pct.toFixed(1)}%</td>
							<td class="py-3 px-3 text-right text-slate-100 font-bold">{formatCurrency(item.cost_usd)}</td>
							<td class="py-3 px-3 text-right text-emerald-400 font-semibold">+{formatCurrency(item.dollars_saved)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
