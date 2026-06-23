<script lang="ts">
	import {
		Activity,
		Clock,
		CheckCircle,
		XCircle,
		AlertCircle,
		RefreshCw,
		Search,
		ChevronRight,
		ChevronDown,
		GitPullRequest,
		CircleDot,
		GitMerge,
		Terminal as TerminalIcon,
		X,
		User,
		Loader2
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getInsightsClient } from '$lib/grpc';

	let { data } = $props();

	let client: any;
	$effect(() => {
		const token = (data.session as { accessToken?: string } | null)?.accessToken;
		if (token) {
			client = getInsightsClient(token);
		}
	});

	type Tab = 'repos' | 'pulls' | 'issues';
	let activeTab = $derived.by<Tab>(() => {
		const tabParam = $page.url.searchParams.get('tab') as Tab | null;
		if (tabParam && ['repos', 'pulls', 'issues'].includes(tabParam)) return tabParam;
		return 'repos';
	});

	function switchTab(tab: Tab) {
		const url = new URL($page.url);
		if (tab === 'repos') url.searchParams.delete('tab');
		else url.searchParams.set('tab', tab);
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

	// Local state for polling and filtering
	let statuses = $state<any[]>([]);
	let lastUpdated = $state(new Date());
	let searchQuery = $state('');
	let activeFilter = $state('all');

	$effect(() => {
		statuses = data.statuses;
		lastUpdated = new Date();
	});

	// PR State
	let pulls = $state<any[]>([]);
	let pullsLoaded = $state(false);
	let loadingPulls = $state(false);
	let pullsTotals = $state<Record<string, number>>({});

	// Issue State
	let issues = $state<any[]>([]);
	let issuesLoaded = $state(false);
	let loadingIssues = $state(false);
	let issuesTotals = $state<Record<string, number>>({});

	// Action states
	let mergingPullNumber = $state<number | null>(null);
	let closingIssueNumber = $state<number | null>(null);
	let rerunningIds = $state<Record<string, boolean>>({});
	let rerunningRunId = $state<string | null>(null);

	// Expanded repos for grouped PR/Issue views
	let expandedPullsRepos = $state<Set<string>>(new Set());
	let expandedIssuesRepos = $state<Set<string>>(new Set());

	let groupedPulls = $derived.by(() => {
		const groups: Record<string, any[]> = {};
		for (const pr of pulls) {
			if (!groups[pr.repo]) groups[pr.repo] = [];
			groups[pr.repo].push(pr);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	});

	let groupedIssues = $derived.by(() => {
		const groups: Record<string, any[]> = {};
		for (const issue of issues) {
			if (!groups[issue.repo]) groups[issue.repo] = [];
			groups[issue.repo].push(issue);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	});

	function toggleRepo(set: Set<string>, repo: string) {
		const next = new Set(set);
		if (next.has(repo)) next.delete(repo);
		else next.add(repo);
		return next;
	}

	// Terminal Logs State
	let terminalOpen = $state(false);
	let terminalLogs = $state('');
	let terminalTitle = $state('');
	let terminalRunId = $state('');
	let terminalRunStatus = $state('');
	let terminalLoading = $state(false);
	let terminalRepo = $state('');

	// Toast notifications
	type ToastType = 'success' | 'error' | 'info';
	let toasts = $state<Array<{ id: number; message: string; type: ToastType }>>([]);
	let toastId = 0;

	function addToast(message: string, type: ToastType = 'info') {
		const id = ++toastId;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 4000);
	}

	// Custom confirm dialog
	let confirmDialog = $state<{ message: string; onConfirm: () => void } | null>(null);

	function showConfirm(message: string, onConfirm: () => void) {
		confirmDialog = { message, onConfirm };
	}

	$effect(() => {
		if (activeTab === 'pulls' && !pullsLoaded) {
			pullsLoaded = true;
			loadPulls();
		}
		if (activeTab === 'issues' && !issuesLoaded) {
			issuesLoaded = true;
			loadIssues();
		}
	});

	// Poll API every 60s
	onMount(() => {
		const interval = setInterval(async () => {
			try {
				if (!client) return;
				if (activeTab === 'repos') {
					const res = await client.getOrgStatus({});
					statuses = res.repositories as any;
				} else if (activeTab === 'pulls' && pullsLoaded) {
					pullsLoaded = false;
					pullsLoaded = true;
				} else if (activeTab === 'issues' && issuesLoaded) {
					issuesLoaded = false;
					issuesLoaded = true;
				}
				lastUpdated = new Date();
			} catch (e) {
				console.error('Failed to poll', e);
			}
		}, 60000);
		return () => clearInterval(interval);
	});

	// Reset loaded flags when tabs switch so data refreshes
	$effect(() => {
		if (activeTab === 'pulls') {
			if (!pullsLoaded) loadPulls();
		}
	});

	$effect(() => {
		if (activeTab === 'issues') {
			if (!issuesLoaded) loadIssues();
		}
	});

	async function loadPulls() {
		if (loadingPulls || !client) return;
		loadingPulls = true;
		try {
			const res = await client.getOrgPulls({ perRepo: 5 });
			pulls = res.pullRequests as any;
			pullsTotals = res.totals as Record<string, number>;
		} catch (e) {
			console.error('Failed to fetch PRs', e);
		} finally {
			loadingPulls = false;
		}
	}

	async function loadIssues() {
		if (loadingIssues || !client) return;
		loadingIssues = true;
		try {
			const res = await client.getOrgIssues({ perRepo: 5 });
			issues = res.issues as any;
			issuesTotals = res.totals as Record<string, number>;
		} catch (e) {
			console.error('Failed to fetch issues', e);
		} finally {
			loadingIssues = false;
		}
	}

	async function mergePR(repo: string, pullNumber: number) {
		showConfirm('Merge this pull request?', async () => {
			mergingPullNumber = pullNumber;

			try {
				const res = await client.mergePullRequest({ repo, pullNumber });

				if (res.merged) {
					pulls = pulls.filter((pr) => !(pr.repo === repo && pr.number === pullNumber));
					addToast(`PR #${pullNumber} merged`, 'success');
				} else {
					addToast(res.message || 'Failed to merge PR', 'error');
				}
			} catch (e) {
				console.error('Error merging PR:', e);
				addToast('Network error while merging', 'error');
			} finally {
				mergingPullNumber = null;
			}
		});
	}

	async function closeIssue(repo: string, issueNumber: number) {
		showConfirm('Close this issue?', async () => {
			closingIssueNumber = issueNumber;

			try {
				const res = await client.closeIssue({ repo, issueNumber });

				if (res.closed) {
					issues = issues.filter((issue) => !(issue.repo === repo && issue.number === issueNumber));
					addToast(`Issue #${issueNumber} closed`, 'success');
				} else {
					addToast('Failed to close issue', 'error');
				}
			} catch (e) {
				console.error('Error closing issue:', e);
				addToast('Network error while closing issue', 'error');
			} finally {
				closingIssueNumber = null;
			}
		});
	}

	async function viewLogs(runId: string, title: string, status: string, repo: string) {
		terminalOpen = true;
		terminalTitle = title;
		terminalRunId = runId;
		terminalRunStatus = status;
		terminalRepo = repo;
		terminalLogs = '';
		terminalLoading = true;

		try {
			const stream = client.getWorkflowLogs({ runId: Number(runId) });
			let logs = '';
			for await (const chunk of stream) {
				logs += new TextDecoder().decode(chunk.data);
			}
			terminalLogs = logs || 'No logs available.';
		} catch (e) {
			console.error('Error fetching logs:', e);
			terminalLogs = 'Failed to fetch logs.';
		} finally {
			terminalLoading = false;
		}
	}

	async function rerunWorkflow(runId: string, repo: string) {
		rerunningIds = { ...rerunningIds, [runId]: true };

		try {
			const res = await client.rerunWorkflow({ repo, runId: Number(runId), failedOnly: true });

			if (res.triggered) {
				addToast('Rerun triggered', 'success');
				pulls = [];
				loadingPulls = false;
				loadPulls();
			} else {
				addToast('Failed to trigger rerun', 'error');
			}
		} catch (error) {
			console.error('Error triggering rerun:', error);
			addToast('Network error while triggering rerun', 'error');
		} finally {
			const next = { ...rerunningIds };
			delete next[runId];
			rerunningIds = next;
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'success':
				return CheckCircle;
			case 'failure':
				return XCircle;
			case 'cancelled':
				return AlertCircle;
			case 'pending':
			case 'queued':
			case 'in_progress':
				return Clock;
			default:
				return AlertCircle;
		}
	}

	function getStatusColorClasses(status: string) {
		switch (status) {
			case 'success':
				return 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20';
			case 'failure':
				return 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20';
			case 'cancelled':
				return 'text-gray-500 dark:text-gray-400 bg-gray-500/10 border-gray-500/20';
			case 'pending':
			case 'queued':
			case 'in_progress':
				return 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
			default:
				return 'text-gray-500 dark:text-gray-400 bg-gray-500/10 border-gray-500/20';
		}
	}

	function getDotColor(status: string) {
		switch (status) {
			case 'success':
				return 'bg-green-500';
			case 'failure':
				return 'bg-red-500';
			case 'cancelled':
				return 'bg-gray-500';
			case 'pending':
				return 'bg-yellow-500 animate-pulse';
			default:
				return 'bg-gray-500';
		}
	}

	// Derived state for repos tab
	let filteredStatuses = $derived(
		statuses
			.filter((s: any) => s.repo.toLowerCase().includes(searchQuery.toLowerCase()))
			.filter((s: any) => (activeFilter === 'all' ? true : s.status === activeFilter))
	);

	let failingCount = $derived(statuses.filter((s: any) => s.status === 'failure').length);
	let pendingCount = $derived(statuses.filter((s: any) => s.status === 'pending').length);
	let cancelledCount = $derived(statuses.filter((s: any) => s.status === 'cancelled').length);

	let systemHealthText = $derived(
		failingCount > 0
			? `System Degraded (${failingCount} failing)`
			: cancelledCount > 0
				? `Some Runs Cancelled (${cancelledCount})`
				: pendingCount > 0
					? `CI In Progress (${pendingCount} building)`
					: 'All Systems Operational'
	);

	let systemHealthClass = $derived(
		failingCount > 0
			? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
			: cancelledCount > 0
				? 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
				: pendingCount > 0
					? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
					: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
	);

	function formatDate(dateString: string) {
		if (!dateString) return 'N/A';
		const date = new Date(dateString);
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}
</script>

<svelte:head>
	<title>Agent CI Dashboard — Mission Control for AI Agents</title>
	<meta
		name="description"
		content="Real-time CI/CD pipeline monitoring, push notifications, and log viewer for the Autonomic AI agent ecosystem."
	/>
</svelte:head>

<div class="max-w-[1200px] mx-auto px-6 py-12 flex flex-col min-h-screen relative z-10">
	<!-- Header -->
	<header class="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
		<div>
			<div class="flex items-center gap-3 mb-3">
				<div
					class="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-orange-600 flex items-center justify-center shadow-lg shadow-cyan-500/30"
				>
					<Activity class="text-white" size={20} />
				</div>
				<h1
					class="text-3xl font-bold text-text-primary-light dark:text-text-primary-dark tracking-tight"
				>
					Agent CI
				</h1>
			</div>
			<p class="text-text-secondary-light dark:text-text-secondary-dark font-medium">
				Mission Control & Repository Health
			</p>
		</div>

		<div class="flex items-center gap-3">
			{#if typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window}
				<button
					class="px-4 py-2 rounded-full text-sm font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all shadow-sm flex items-center gap-2"
					onclick={async () => {
						try {
							const result = await Notification.requestPermission();
							if (result === 'granted') {
								const reg = await navigator.serviceWorker.ready;

								const { env } = await import('$env/dynamic/public');
								const applicationServerKey = env.PUBLIC_VAPID_KEY;

								if (!applicationServerKey) {
									alert('Push notifications are not configured on this server.');
									return;
								}

								const subscription = await reg.pushManager.subscribe({
									userVisibleOnly: true,
									applicationServerKey
								});

								const res = await fetch('/api/push/subscribe', {
									method: 'POST',
									body: JSON.stringify({ subscription }),
									headers: { 'Content-Type': 'application/json' }
								});

								if (res.ok) {
									alert(
										'Push Notifications Enabled! You will now receive alerts when builds fail.'
									);
								} else {
									const json = await res.json();
									alert(`Failed to save subscription: ${json.error || 'Unknown error'}`);
								}
							} else {
								alert('Notification permission denied.');
							}
						} catch (e) {
							console.error('Error enabling push notifications:', e);
							alert('An error occurred while enabling push notifications.');
						}
					}}
				>
					<AlertCircle size={14} /> Enable Push
				</button>
			{/if}

			<div
				class="flex items-center gap-3 text-sm text-text-secondary-light dark:text-text-secondary-dark font-medium px-4 py-2 bg-surface-light dark:bg-surface-dark rounded-full border border-border-light dark:border-border-dark shadow-sm"
			>
				<span class="relative flex h-2 w-2">
					<span
						class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"
					></span>
					<span class="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
				</span>
				<span
					>Live Updates • Last sync: {lastUpdated.toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit',
						hour12: false
					})}</span
				>
				<div class="w-px h-4 bg-border-light dark:bg-border-dark mx-1"></div>
				<button
					class="text-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors p-1 rounded-full hover:bg-cyan-500/10"
					onclick={async () => {
						try {
							if (!client) return;
							const statusRes = await client.getOrgStatus({});
							statuses = statusRes.repositories as any;
						} catch (e) {
							console.error('Failed to fetch status', e);
						}
						if (pullsLoaded) {
							pullsLoaded = false;
							pullsLoaded = true;
						}
						if (issuesLoaded) {
							issuesLoaded = false;
							issuesLoaded = true;
						}
						lastUpdated = new Date();
					}}
					title="Refresh Now"
				>
					<RefreshCw size={14} />
				</button>
			</div>
		</div>
	</header>

	<!-- Global System Banner -->
	<div
		class={`mb-10 flex items-center justify-center py-4 px-6 rounded-2xl border font-bold text-lg tracking-wide shadow-sm transition-colors ${systemHealthClass}`}
	>
		{systemHealthText}
	</div>

	<!-- Tabs -->
	<div
		class="flex gap-2 mb-8 border-b border-border-light dark:border-border-dark overflow-x-auto pb-1"
	>
		<button
			onclick={() => switchTab('repos')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'repos' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400 bg-black/5 dark:bg-white/5' : 'text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark hover:bg-black/5 dark:hover:bg-white/5'}`}
		>
			<Activity size={18} />
			<span>Repos</span>
		</button>
		<button
			onclick={() => switchTab('pulls')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'pulls' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400 bg-black/5 dark:bg-white/5' : 'text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark hover:bg-black/5 dark:hover:bg-white/5'}`}
		>
			<GitPullRequest size={18} />
			<span>Pull Requests</span>
		</button>
		<button
			onclick={() => switchTab('issues')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'issues' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400 bg-black/5 dark:bg-white/5' : 'text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark hover:bg-black/5 dark:hover:bg-white/5'}`}
		>
			<CircleDot size={18} />
			<span>Issues</span>
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'repos'}
		<!-- Controls (Search & Filter) -->
		<div class="mb-8 flex flex-col sm:flex-row justify-between gap-4">
			<div class="relative w-full sm:max-w-xs">
				<div
					class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"
				>
					<Search size={18} />
				</div>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search repositories..."
					class="w-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl py-2.5 pl-10 pr-4 text-sm text-text-primary-light dark:text-text-primary-dark focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all shadow-sm"
				/>
			</div>

			<div class="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
				{#each ['all', 'failure', 'cancelled', 'pending', 'success'] as filter}
					<button
						onclick={() => (activeFilter = filter)}
						class={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all border whitespace-nowrap ${activeFilter === filter ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' : 'bg-surface-light dark:bg-surface-dark text-text-secondary-light dark:text-text-secondary-dark border-border-light dark:border-border-dark hover:border-border-light-hover dark:hover:border-border-dark-hover'}`}
					>
						{filter}
					</button>
				{/each}
			</div>
		</div>

		<!-- Grid -->
		<div class="flex flex-col gap-6">
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
				{#each filteredStatuses as item, i}
					{@const StatusIcon = getStatusIcon(item.status)}
					<a
						href={`/repo/${item.repo}`}
						class="group relative glass-card rounded-2xl p-5 flex flex-col overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/10 dark:hover:shadow-cyan-500/20 hover:-translate-y-1 animate-fade-in-up"
						style="animation-delay: {i * 50}ms;"
					>
						<!-- Header -->
						<div class="flex items-start justify-between mb-4 z-10 relative">
							<div class="flex flex-col">
								<h2
									class="text-lg font-bold text-text-primary-light dark:text-text-primary-dark mb-1 group-hover:text-cyan-500 transition-colors"
								>
									{item.repo}
								</h2>

								<!-- Metadata Inline -->
								<div
									class="flex items-center gap-2 text-[13px] text-text-secondary-light dark:text-text-secondary-dark font-medium"
								>
									{#if item.tag}
										<span
											class="font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded border border-border-light dark:border-border-dark group-hover:border-cyan-500/30 transition-colors"
											>{item.tag}</span
										>
									{/if}
									{#if item.sha}
										<span class="font-mono opacity-60">{item.sha.substring(0, 7)}</span>
									{/if}
								</div>
							</div>

							<!-- Status Pill Minimal -->
							<div
								class={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase border bg-surface-light dark:bg-surface-dark ${getStatusColorClasses(item.status)}`}
							>
								<!-- Glowing Dot -->
								<span class="relative flex h-2 w-2 mr-1">
									{#if item.status === 'pending'}
										<span
											class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"
										></span>
									{/if}
									<span
										class={`relative inline-flex rounded-full h-2 w-2 ${getDotColor(item.status)}`}
										style="box-shadow: 0 0 8px currentColor"
									></span>
								</span>
								{item.status}
							</div>
						</div>

						<!-- Content / Workflows -->
						<div class="flex-1 flex flex-col justify-center min-h-[80px]">
							{#if item.status === 'no-runs'}
								<p class="text-sm text-text-secondary-light dark:text-text-secondary-dark italic">
									No workflows ran on this commit.
								</p>
							{:else if item.status === 'no-tags'}
								<p class="text-sm text-text-secondary-light dark:text-text-secondary-dark italic">
									No releases found.
								</p>
							{:else}
								<div
									class="mt-4 pt-4 border-t border-border-light/50 dark:border-border-dark/50 z-10 relative"
								>
									<div class="flex flex-col gap-2">
										{#each item.workflows.slice(0, 3) as workflow}
											{@const WfIcon = getStatusIcon(workflow.status)}
											<div class="flex items-center justify-between text-[13px]">
												<span
													class="text-text-secondary-light dark:text-text-secondary-dark truncate pr-4"
													>{workflow.name}</span
												>
												<div class="flex items-center gap-1.5 shrink-0">
													<WfIcon
														size={14}
														class={workflow.status === 'success'
															? 'text-green-500 dark:text-green-400'
															: workflow.status === 'failure' || workflow.status === 'timed_out'
																? 'text-red-500 dark:text-red-400'
																: workflow.status === 'cancelled'
																	? 'text-gray-500 dark:text-gray-400'
																	: 'text-yellow-500 dark:text-yellow-400'}
													/>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>

						<!-- Footer Info -->
						<div
							class="mt-5 pt-3 border-t border-border-light/20 dark:border-border-dark/20 flex items-center justify-between text-[12px] text-text-secondary-light/70 dark:text-text-secondary-dark/70 relative z-10"
						>
							<div class="flex items-center gap-2">
								{#if item.actor}
									<img
										src={item.actor.avatarUrl}
										alt={item.actor.login}
										class="w-5 h-5 rounded-full opacity-80"
									/>
									<span>{item.actor.login}</span>
								{:else}
									<span>—</span>
								{/if}
							</div>
							<div class="flex items-center gap-1.5">
								<Clock size={12} class="opacity-70" />
								<span>
									{#if item.updatedAt}
										{new Date(item.updatedAt).toLocaleDateString(undefined, {
											month: 'short',
											day: 'numeric',
											hour: '2-digit',
											minute: '2-digit',
											hour12: false
										})}
									{:else}
										Unknown
									{/if}
								</span>
							</div>
						</div>
					</a>
				{/each}
			</div>

			{#if filteredStatuses.length === 0}
				<div class="text-center py-12 text-text-secondary-light dark:text-text-secondary-dark">
					No repositories match your filter.
				</div>
			{/if}
		</div>
	{:else if activeTab === 'pulls'}
		<!-- Pull Requests Section -->
		<section class="animate-in fade-in slide-in-from-bottom-4 duration-500">
			{#if loadingPulls && pulls.length === 0}
				<div class="h-20 flex items-center justify-center mt-6">
					<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
				</div>
			{:else if pulls.length === 0}
				<div
					class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-8 text-center text-text-secondary-light dark:text-text-secondary-dark"
				>
					<p>No open pull requests across any repository.</p>
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					{#each groupedPulls as [repo, repoPulls]}
						{@const isExpanded = expandedPullsRepos.has(repo)}
						<div
							class="glass-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
						>
							<!-- Repo Header -->
							<button
								onclick={() => (expandedPullsRepos = toggleRepo(expandedPullsRepos, repo))}
								class="w-full flex items-center justify-between px-5 py-3 bg-black/5 dark:bg-white/5 border-b border-border-light/50 dark:border-border-dark/50 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-left"
							>
								<div class="flex items-center gap-3">
									<span
										class="transition-transform duration-200 {isExpanded ? 'rotate-90' : ''}"
									>
										<ChevronRight
											size={16}
											class="text-text-secondary-light dark:text-text-secondary-dark"
										/>
									</span>
									<a
										href={`/repo/${repo}`}
										onclick={(e) => e.stopPropagation()}
										class="text-sm font-mono font-bold text-text-primary-light dark:text-text-primary-dark hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
									>
										{repo}
									</a>
								</div>
								<div class="flex items-center gap-2 shrink-0">
									<a
										href={`/repo/${repo}?tab=pulls`}
										onclick={(e) => e.stopPropagation()}
										class="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 transition-colors"
									>
										{pullsTotals[repo] > repoPulls.length ? `View all ${pullsTotals[repo]} →` : ''}
									</a>
									<span
										class="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20"
									>
										{pullsTotals[repo] ?? repoPulls.length} PR{pullsTotals[repo] !== 1 ? 's' : ''}
									</span>
								</div>
							</button>

							{#if isExpanded}
								<div class="flex flex-col">
									{#each repoPulls as pr}
										{@const PrStatusIcon = getStatusIcon(pr.status)}
										{@const isConflicting = pr.mergeable === 'CONFLICTING'}
										{@const isUnknown = pr.mergeable === 'UNKNOWN'}
										<div
											class="p-5 border-b border-border-light/30 dark:border-border-dark/30 last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
										>
											<div class="flex justify-between items-start gap-4">
												<div class="flex flex-col gap-1.5 min-w-0 flex-1">
													<a
														href={pr.url}
														target="_blank"
														rel="noopener noreferrer"
														class="text-[15px] font-medium text-text-primary-light dark:text-text-primary-dark hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors truncate"
														title={pr.title}
													>
														{pr.title}
													</a>
													<div
														class="flex items-center gap-3 text-[13px] text-text-secondary-light dark:text-text-secondary-dark flex-wrap"
													>
														{#if pr.isDraft}
															<span
																class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/10 text-gray-500 dark:text-gray-400 border border-gray-500/30"
																>Draft</span
															>
														{/if}
														<span
															class="font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded border border-border-light dark:border-border-dark"
															>#{pr.number}</span
														>
														{#if pr.author}
															<a
																href={pr.author.url}
																target="_blank"
																rel="noopener noreferrer"
																class="flex items-center gap-1.5 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
															>
																<img
																	src={pr.author.avatarUrl}
																	alt={pr.author.login}
																	class="w-4 h-4 rounded-full"
																/>
																<span>{pr.author.login}</span>
															</a>
														{/if}
														<span class="flex items-center gap-1"
															><Clock size={13} /> {formatDate(pr.createdAt)}</span
														>
														<span
															class="text-xs font-mono text-text-secondary-light dark:text-text-secondary-dark"
															>{pr.headRefName} → {pr.baseRefName}</span
														>
													</div>
													{#if pr.labels && pr.labels.length > 0}
														<div class="flex flex-wrap gap-1.5 mt-1">
															{#each pr.labels as label}
																<span
																	class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
																	style="background-color: #{label.color}20; border-color: #{label.color}40; color: #{label.color === 'ffffff' ? 'currentColor' : '#' + label.color}"
																	title={label.description || label.name}
																>
																	{label.name}
																</span>
															{/each}
														</div>
													{/if}
												</div>

												<div class="flex items-center gap-2 shrink-0">
													<div
														class="hidden sm:flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border {isConflicting ? 'border-red-500/30 text-red-400' : isUnknown ? 'border-yellow-500/30 text-yellow-400' : 'border-green-500/30 text-green-400'}"
														title={isConflicting ? 'Merge conflicts' : isUnknown ? 'Mergeability unknown' : 'Ready to merge'}
													>
														{#if isConflicting}
															<XCircle size={12} />
															<span>Conflicts</span>
														{:else if isUnknown}
															<AlertCircle size={12} />
															<span>Checking</span>
														{:else}
															<CheckCircle size={12} />
															<span>Mergeable</span>
														{/if}
													</div>
													{#if data.session}
														<button
															onclick={(e) => {
																e.preventDefault();
																mergePR(pr.repo, pr.number);
															}}
															disabled={mergingPullNumber === pr.number || pr.mergeable !== 'MERGEABLE' || pr.status !== 'success'}
															title={isConflicting ? 'Has conflicts' : isUnknown ? 'Checking mergeability' : 'Merge PR'}
															class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
														>
															<GitMerge size={14} class={mergingPullNumber === pr.number ? 'animate-spin' : ''} />
															<span class="hidden sm:inline">{mergingPullNumber === pr.number ? 'Merging...' : 'Merge'}</span>
														</button>
													{/if}
													<div
														class={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase border ${getStatusColorClasses(pr.status)}`}
														title={pr.status}
													>
														<PrStatusIcon size={14} />
														<span class="hidden sm:inline">{pr.status}</span>
													</div>
												</div>
											</div>

											{#if pr.assignees && pr.assignees.length > 0}
												<div class="flex items-center gap-1.5 mt-3">
													<User size={14} class="text-text-secondary-light dark:text-text-secondary-dark" />
													{#each pr.assignees as assignee}
														<img
															src={assignee.avatarUrl}
															alt={assignee.login}
															title={assignee.login}
															class="w-5 h-5 rounded-full border border-border-light dark:border-border-dark"
														/>
													{/each}
												</div>
											{/if}

											{#if pr.checks && pr.checks.length > 0}
												<div
													class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 mt-3 border-t border-border-light/50 dark:border-border-dark/50"
												>
													{#each pr.checks as check}
														{@const CheckIcon = getStatusIcon(check.status)}
														<div
															class="group flex items-center justify-between text-[13px] bg-black/5 dark:bg-white/5 border border-border-light/50 dark:border-border-dark/50 px-3 py-2 rounded-lg hover:border-cyan-500/30 transition-colors"
														>
															<button
																disabled={check.status === 'queued' || check.status === 'in_progress' || check.status === 'pending'}
																onclick={(e) => {
																	e.preventDefault();
																	if (check.id) viewLogs(check.id, check.name, check.status, pr.repo);
																}}
																class="flex items-center gap-2 flex-1 min-w-0 text-left focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed group/btn"
																title={check.status === 'queued' || check.status === 'in_progress' || check.status === 'pending'
																	? 'Logs will be available when the run completes'
																	: check.name}
															>
																<CheckIcon
																	size={14}
																	class={check.status === 'success'
																		? 'text-green-500 dark:text-green-400'
																		: check.status === 'failure' || check.status === 'timed_out'
																			? 'text-red-500 dark:text-red-400'
																			: check.status === 'cancelled'
																				? 'text-gray-500 dark:text-gray-400'
																				: 'text-yellow-500 dark:text-yellow-400'}
																/>
																<span
																	class="text-text-primary-light dark:text-text-primary-dark truncate transition-colors group-[&:not(:disabled)]/btn:group-hover:text-cyan-600 group-[&:not(:disabled)]/btn:dark:group-hover:text-cyan-400"
																	>{check.name}</span
																>
															</button>

															<a
																href={check.url || '#'}
																target={check.url ? '_blank' : undefined}
																rel="noopener noreferrer"
																class="opacity-0 group-hover:opacity-100 p-1.5 ml-2 text-text-secondary-light hover:text-cyan-600 dark:text-text-secondary-dark dark:hover:text-cyan-400 bg-white dark:bg-black rounded border border-border-light dark:border-border-dark shadow-sm transition-all"
																title="View on GitHub"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	width="12"
																	height="12"
																	viewBox="0 0 24 24"
																	fill="none"
																	stroke="currentColor"
																	stroke-width="2"
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	><path
																		d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
																	/><path d="M9 18c-4.51 2-5-2-7-2" /></svg
																>
															</a>

															{#if data.session && (check.status === 'failure' || check.status === 'timed_out' || check.status === 'cancelled') && check.id}
																<button
																	onclick={(e) => {
																		e.preventDefault();
																		rerunWorkflow(check.id, pr.repo);
																	}}
																	disabled={rerunningIds[String(check.id)]}
																	class="opacity-0 group-hover:opacity-100 p-1.5 text-text-secondary-light hover:text-cyan-600 dark:text-text-secondary-dark dark:hover:text-cyan-400 bg-white dark:bg-black rounded border border-border-light dark:border-border-dark shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
																	title="Rerun failed jobs"
																>
																	<RefreshCw size={12} class={rerunningIds[String(check.id)] ? 'animate-spin' : ''} />
																</button>
															{/if}
														</div>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else if activeTab === 'issues'}
		<!-- Issues Section -->
		<section class="animate-in fade-in slide-in-from-bottom-4 duration-500">
			{#if loadingIssues && issues.length === 0}
				<div class="h-20 flex items-center justify-center mt-6">
					<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
				</div>
			{:else if issues.length === 0}
				<div
					class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-8 text-center text-text-secondary-light dark:text-text-secondary-dark"
				>
					<p>No open issues across any repository.</p>
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					{#each groupedIssues as [repo, repoIssues]}
						{@const isExpanded = expandedIssuesRepos.has(repo)}
						<div
							class="glass-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
						>
							<!-- Repo Header -->
							<button
								onclick={() => (expandedIssuesRepos = toggleRepo(expandedIssuesRepos, repo))}
								class="w-full flex items-center justify-between px-5 py-3 bg-black/5 dark:bg-white/5 border-b border-border-light/50 dark:border-border-dark/50 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-left"
							>
								<div class="flex items-center gap-3">
									<span
										class="transition-transform duration-200 {isExpanded ? 'rotate-90' : ''}"
									>
										<ChevronRight
											size={16}
											class="text-text-secondary-light dark:text-text-secondary-dark"
										/>
									</span>
									<a
										href={`/repo/${repo}`}
										onclick={(e) => e.stopPropagation()}
										class="text-sm font-mono font-bold text-text-primary-light dark:text-text-primary-dark hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
									>
										{repo}
									</a>
								</div>
								<div class="flex items-center gap-2 shrink-0">
									<a
										href={`/repo/${repo}?tab=issues`}
										onclick={(e) => e.stopPropagation()}
										class="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 transition-colors"
									>
										{issuesTotals[repo] > repoIssues.length ? `View all ${issuesTotals[repo]} →` : ''}
									</a>
									<span
										class="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20"
									>
										{issuesTotals[repo] ?? repoIssues.length} Issue{issuesTotals[repo] !== 1 ? 's' : ''}
									</span>
								</div>
							</button>

							{#if isExpanded}
								<div class="flex flex-col">
									{#each repoIssues as issue}
										<div
											class="p-5 border-b border-border-light/30 dark:border-border-dark/30 last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
										>
											<div class="flex justify-between items-start gap-4">
												<div class="flex flex-col gap-1.5 min-w-0 flex-1">
													<a
														href={issue.url}
														target="_blank"
														rel="noopener noreferrer"
														class="text-[15px] font-medium text-text-primary-light dark:text-text-primary-dark hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors truncate"
														title={issue.title}
													>
														{issue.title}
													</a>
													<div
														class="flex items-center gap-3 text-[13px] text-text-secondary-light dark:text-text-secondary-dark flex-wrap"
													>
														<span
															class="font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded border border-border-light dark:border-border-dark"
															>#{issue.number}</span
														>
														{#if issue.author}
															<a
																href={issue.author.url}
																target="_blank"
																rel="noopener noreferrer"
																class="flex items-center gap-1.5 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
															>
																<img
																	src={issue.author.avatarUrl}
																	alt={issue.author.login}
																	class="w-4 h-4 rounded-full"
																/>
																<span>{issue.author.login}</span>
															</a>
														{/if}
														<span class="flex items-center gap-1"
															><Clock size={13} /> {formatDate(issue.createdAt)}</span
														>
													</div>
													{#if issue.labels && issue.labels.length > 0}
														<div class="flex flex-wrap gap-1.5 mt-1">
															{#each issue.labels as label}
																<span
																	class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
																	style="background-color: #{label.color}20; border-color: #{label.color}40; color: #{label.color === 'ffffff' ? 'currentColor' : '#' + label.color}"
																	title={label.description || label.name}
																>
																	{label.name}
																</span>
															{/each}
														</div>
													{/if}
												</div>

												{#if data.session}
													<button
														onclick={(e) => {
															e.preventDefault();
															closeIssue(issue.repo, issue.number);
														}}
														disabled={closingIssueNumber === issue.number}
														class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
														title="Close issue"
													>
														<XCircle size={14} class={closingIssueNumber === issue.number ? 'animate-spin' : ''} />
														<span class="hidden sm:inline">{closingIssueNumber === issue.number ? 'Closing...' : 'Close'}</span>
													</button>
												{/if}
											</div>

											{#if issue.assignees && issue.assignees.length > 0}
												<div class="flex items-center gap-1.5 mt-3">
													<User size={14} class="text-text-secondary-light dark:text-text-secondary-dark" />
													{#each issue.assignees as assignee}
														<img
															src={assignee.avatarUrl}
															alt={assignee.login}
															title={assignee.login}
															class="w-5 h-5 rounded-full border border-border-light dark:border-border-dark"
														/>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

<!-- Terminal Modal -->
{#if terminalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
	>
		<div
			class="bg-[#0D1117] border border-border-dark rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
		>
			<!-- Terminal Header -->
			<div
				class="bg-[#161B22] border-b border-border-dark px-4 py-3 flex items-center justify-between"
			>
				<div class="flex items-center gap-3">
					<TerminalIcon size={16} class="text-gray-400" />
					<h3 class="text-gray-200 font-mono text-sm font-semibold">{terminalTitle} Logs</h3>
					{#if data.session && (terminalRunStatus === 'failure' || terminalRunStatus === 'timed_out' || terminalRunStatus === 'cancelled')}
						<div class="w-px h-4 bg-border-dark mx-2"></div>
						<button
							onclick={(e) => {
								e.preventDefault();
								rerunWorkflow(terminalRunId, terminalRepo);
							}}
							disabled={rerunningIds[terminalRunId]}
							class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							title="Rerun Failed Jobs"
						>
							<RefreshCw size={12} class={rerunningIds[terminalRunId] ? 'animate-spin' : ''} />
							<span>Rerun Failed</span>
						</button>
					{/if}
				</div>
				<button
					onclick={() => (terminalOpen = false)}
					class="text-gray-400 hover:text-white transition-colors bg-[#21262D] hover:bg-[#30363D] p-1.5 rounded-md"
				>
					<X size={16} />
				</button>
			</div>

			<!-- Terminal Body -->
			<div
				class="flex-1 p-4 overflow-y-auto bg-[#0D1117] text-green-400 font-mono text-[13px] leading-relaxed custom-scrollbar"
			>
				{#if terminalLoading}
					<div class="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
						<Loader2 class="w-8 h-8 animate-spin text-cyan-500" />
						<p class="font-sans text-sm">Fetching remote logs from GitHub Actions...</p>
					</div>
				{:else}
					<pre class="whitespace-pre-wrap break-words m-0">{terminalLogs}</pre>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Confirm dialog -->
{#if confirmDialog}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={() => (confirmDialog = null)}
		onkeydown={(e) => e.key === 'Escape' && (confirmDialog = null)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
			role="none"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<p class="text-text-primary-light dark:text-text-primary-dark font-medium mb-6 text-center">
				{confirmDialog.message}
			</p>
			<div class="flex gap-3 justify-center">
				<button
					onclick={() => {
						const action = confirmDialog!.onConfirm;
						confirmDialog = null;
						action();
					}}
					class="px-6 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors"
				>
					Confirm
				</button>
				<button
					onclick={() => (confirmDialog = null)}
					class="px-6 py-2 rounded-xl bg-surface-light dark:bg-surface-dark hover:bg-border-light dark:hover:bg-border-dark text-text-secondary-light dark:text-text-secondary-dark font-medium transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Toast container -->
{#if toasts.length > 0}
	<div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
		{#each toasts as toast (toast.id)}
			<div
				class="animate-in slide-in-from-right-4 fade-in duration-300 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium backdrop-blur-sm {toast.type === 'success' ? 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30' : toast.type === 'error' ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30'}"
			>
				{#if toast.type === 'success'}
					<CheckCircle size={16} />
				{:else if toast.type === 'error'}
					<XCircle size={16} />
				{:else}
					<AlertCircle size={16} />
				{/if}
				<span>{toast.message}</span>
				<button
					onclick={() => (toasts = toasts.filter((t) => t.id !== toast.id))}
					class="ml-auto p-0.5 opacity-60 hover:opacity-100 transition-opacity"
				>
					<X size={14} />
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.hide-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.hide-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.custom-scrollbar::-webkit-scrollbar {
		width: 8px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: #0d1117;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #30363d;
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #8b949e;
	}
</style>
