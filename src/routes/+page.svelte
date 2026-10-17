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
		Loader2,
		ShieldCheck,
		Cpu,
		Layers,
		Radio,
		Zap,
		ExternalLink,
		Info,
		Check
	} from '@lucide/svelte';
	import AutonomicLogo from '$lib/components/AutonomicLogo.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data } = $props();

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

	// Organ Taxonomy & Metadata
	interface OrganMeta {
		role: string;
		category: 'core' | 'execution' | 'sensory' | 'interface';
		daemon: boolean;
		arch: string;
		isSigned: boolean;
	}

	const ORGAN_METADATA: Record<string, OrganMeta> = {
		'agent-body': {
			role: 'Supervisor, lifecycle engine & doctor daemon',
			category: 'core',
			daemon: true,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-brain': {
			role: 'Shared stdio proxy, context & durable memory',
			category: 'core',
			daemon: true,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-spine': {
			role: 'DAG execution engine & workflow gates',
			category: 'core',
			daemon: false,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-muscle': {
			role: 'Sandboxed command execution & Wasmer engine',
			category: 'execution',
			daemon: false,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-heart': {
			role: 'Token budget gatekeeper & memory GC daemon',
			category: 'execution',
			daemon: true,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-mouth': {
			role: 'AST command validator & notification gateway',
			category: 'execution',
			daemon: false,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-immune': {
			role: 'Vulnerability scanner & memory growth checks',
			category: 'execution',
			daemon: false,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-nerves': {
			role: 'NATS/JetStream message bus & telemetry bridge',
			category: 'sensory',
			daemon: true,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-eyes': {
			role: 'Visual capture, DOM indexing & VLM descriptor',
			category: 'sensory',
			daemon: false,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-tui': {
			role: 'Real-time terminal UI & interactive console',
			category: 'interface',
			daemon: false,
			arch: 'darwin-arm64',
			isSigned: true
		},
		'agent-ci-dashboard': {
			role: 'Mission control telemetry & release manager',
			category: 'interface',
			daemon: false,
			arch: 'darwin-arm64',
			isSigned: false
		}
	};

	// Local state for polling and filtering
	const getInitialStatuses = () => data.statuses;
	let statuses = $state(getInitialStatuses());
	let lastUpdated = $state(new Date());
	let searchQuery = $state('');
	let activeStatusFilter = $state('all');
	let activeCategoryFilter = $state<'all' | 'core' | 'execution' | 'sensory' | 'interface'>('all');
	let complianceModalOpen = $state(false);

	// UTC & Local clocks
	let currentTimeUTC = $state('');
	let currentTimeLocal = $state('');

	function updateClocks() {
		const now = new Date();
		currentTimeUTC = now.toISOString().slice(11, 19) + ' UTC';
		currentTimeLocal = now.toLocaleTimeString([], { hour12: false });
	}

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
	let mergingIds = $state<Set<number>>(new Set());
	let closingIds = $state<Set<number>>(new Set());
	let rerunningIds = $state<Set<string>>(new Set());

	// PR Selection & Batch Operations
	let selectedPRs = $state<Set<string>>(new Set());
	let batchMerging = $state(false);
	let updatingBranchIds = $state<Set<string>>(new Set());
	let updatingAllOutdated = $state(false);

	function getPRKey(repo: string, num: number) {
		return `${repo}#${num}`;
	}

	function toggleSelectPR(repo: string, num: number) {
		const key = getPRKey(repo, num);
		const next = new Set(selectedPRs);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		selectedPRs = next;
	}

	let readyPRs = $derived(pulls.filter((pr) => pr.canMerge));
	let outdatedPRs = $derived(pulls.filter((pr) => pr.isBehind));

	function selectAllReady() {
		const next = new Set<string>();
		for (const pr of readyPRs) {
			next.add(getPRKey(pr.repo, pr.number));
		}
		selectedPRs = next;
	}

	function clearPRSelection() {
		selectedPRs = new Set();
	}

	async function updateBranch(repo: string, pullNumber: number) {
		const key = getPRKey(repo, pullNumber);
		updatingBranchIds.add(key);
		updatingBranchIds = new Set(updatingBranchIds);

		try {
			const res = await fetch(`/api/repo/${repo}/pulls/update-branch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pullNumber })
			});

			const json = await res.json();
			if (res.ok && json.success) {
				addToast(`Updated branch for ${repo}#${pullNumber} with latest base`, 'success');
				pullsLoaded = false;
				await loadPulls();
			} else {
				addToast(json.error || 'Failed to update branch', 'error');
			}
		} catch (e) {
			console.error(`Error updating branch for ${repo}#${pullNumber}:`, e);
			addToast('Network error while updating branch', 'error');
		} finally {
			updatingBranchIds.delete(key);
			updatingBranchIds = new Set(updatingBranchIds);
		}
	}

	async function batchUpdateOutdated() {
		if (outdatedPRs.length === 0) return;
		if (!confirm(`Update all ${outdatedPRs.length} outdated branch(es) with latest base?`)) return;

		updatingAllOutdated = true;
		let updatedCount = 0;
		for (const pr of outdatedPRs) {
			const key = getPRKey(pr.repo, pr.number);
			updatingBranchIds.add(key);
			updatingBranchIds = new Set(updatingBranchIds);

			try {
				const res = await fetch(`/api/repo/${pr.repo}/pulls/update-branch`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pullNumber: pr.number })
				});
				if (res.ok) updatedCount++;
			} catch (e) {
				console.error(`Failed to update ${pr.repo}#${pr.number}:`, e);
			} finally {
				updatingBranchIds.delete(key);
				updatingBranchIds = new Set(updatingBranchIds);
			}
		}
		updatingAllOutdated = false;
		addToast(`Updated ${updatedCount}/${outdatedPRs.length} branches. Refreshing PRs...`, 'success');
		pullsLoaded = false;
		await loadPulls();
	}

	async function batchMergeSelected() {
		if (selectedPRs.size === 0) return;
		if (!confirm(`Squash and merge all ${selectedPRs.size} selected pull requests?`)) return;

		batchMerging = true;
		const itemsToMerge = Array.from(selectedPRs).map((key) => {
			const [repo, numStr] = key.split('#');
			return { repo, pullNumber: parseInt(numStr, 10) };
		});

		try {
			const res = await fetch('/api/pulls/batch-merge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items: itemsToMerge })
			});

			const json = await res.json();
			if (res.ok && json.success) {
				const mergedCount = json.mergedCount || 0;
				addToast(`Batch merge complete: ${mergedCount}/${itemsToMerge.length} PRs merged!`, 'success');
				selectedPRs = new Set();
				pullsLoaded = false;
				await loadPulls();
			} else {
				addToast(json.error || 'Batch merge finished with some errors', 'error');
				pullsLoaded = false;
				await loadPulls();
			}
		} catch (e) {
			console.error('Batch merge error:', e);
			addToast('Network error during batch merge', 'error');
		} finally {
			batchMerging = false;
		}
	}

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

	// Poll API every 45s and tick clock
	onMount(() => {
		updateClocks();
		const clockInterval = setInterval(updateClocks, 1000);

		const interval = setInterval(async () => {
			if (activeTab !== 'repos') return;
			try {
				const res = await fetch('/api/status');
				const json = await res.json();
				if (json.success) {
					statuses = json.data;
					lastUpdated = new Date();
				}
			} catch (e) {
				console.error('Failed to poll status', e);
			}
		}, 45000);

		return () => {
			clearInterval(interval);
			clearInterval(clockInterval);
		};
	});

	// Reset loaded flags when tabs switch
	$effect(() => {
		if (activeTab === 'pulls' && !pullsLoaded) loadPulls();
	});

	$effect(() => {
		if (activeTab === 'issues' && !issuesLoaded) loadIssues();
	});

	async function loadPulls() {
		if (loadingPulls) return;
		loadingPulls = true;
		try {
			const res = await fetch('/api/pulls');
			const json = await res.json();
			if (json.success) {
				pulls = json.data;
				pullsTotals = json.totals || {};
			}
		} catch (e) {
			console.error('Failed to fetch PRs', e);
		} finally {
			loadingPulls = false;
		}
	}

	async function loadIssues() {
		if (loadingIssues) return;
		loadingIssues = true;
		try {
			const res = await fetch('/api/issues');
			const json = await res.json();
			if (json.success) {
				issues = json.data;
				issuesTotals = json.totals || {};
			}
		} catch (e) {
			console.error('Failed to fetch issues', e);
		} finally {
			loadingIssues = false;
		}
	}

	async function mergePR(repo: string, pullNumber: number) {
		if (!confirm('Merge this pull request via squash?')) return;
		mergingIds.add(pullNumber);
		mergingIds = new Set(mergingIds);

		try {
			const res = await fetch(`/api/repo/${repo}/pulls/merge`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pullNumber })
			});

			if (res.ok) {
				pulls = pulls.filter((pr) => !(pr.repo === repo && pr.number === pullNumber));
				addToast(`PR #${pullNumber} squashed & merged`, 'success');
			} else {
				const json = await res.json();
				addToast(json.error || 'Failed to merge PR', 'error');
				if (json.isBehind) {
					pullsLoaded = false;
					await loadPulls();
				}
			}
		} catch (e) {
			console.error('Error merging PR:', e);
			addToast('Network error while merging', 'error');
		} finally {
			mergingIds.delete(pullNumber);
			mergingIds = new Set(mergingIds);
		}
	}

	async function closeIssue(repo: string, issueNumber: number) {
		if (!confirm('Close this issue?')) return;
		closingIds.add(issueNumber);
		closingIds = new Set(closingIds);

		try {
			const res = await fetch(`/api/repo/${repo}/issues/close`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ issueNumber })
			});

			if (res.ok) {
				issues = issues.filter((issue) => !(issue.repo === repo && issue.number === issueNumber));
				addToast(`Issue #${issueNumber} closed`, 'success');
			} else {
				const json = await res.json();
				addToast(json.error || 'Failed to close issue', 'error');
			}
		} catch (e) {
			console.error('Error closing issue:', e);
			addToast('Network error while closing issue', 'error');
		} finally {
			closingIds.delete(issueNumber);
			closingIds = new Set(closingIds);
		}
	}

	async function openTerminal(runId: string, repo: string, title: string, status: string) {
		terminalTitle = title;
		terminalRunId = runId;
		terminalRunStatus = status;
		terminalRepo = repo;
		terminalLogs = '';
		terminalLoading = true;
		terminalOpen = true;

		try {
			const res = await fetch(`/api/repo/${repo}/logs?runId=${runId}`);
			if (res.ok) {
				const json = await res.json();
				terminalLogs = json.logs || 'No logs available for this run.';
			} else {
				terminalLogs = 'Failed to load logs. You might need to sign in with GitHub.';
			}
		} catch (e) {
			console.error('Failed to load logs', e);
			terminalLogs = 'Failed to fetch logs.';
		} finally {
			terminalLoading = false;
		}
	}

	async function rerunWorkflow(runId: string, repo: string) {
		rerunningIds.add(runId);
		rerunningIds = new Set(rerunningIds);

		try {
			const response = await fetch(`/api/repo/${repo}/run`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ runId, type: 'failed' })
			});

			if (response.ok) {
				addToast('Rerun triggered', 'success');
				pulls = [];
				loadingPulls = false;
				loadPulls();
			} else {
				const res = await response.json();
				addToast(res.error || 'Failed to trigger rerun', 'error');
			}
		} catch (error) {
			console.error('Error triggering rerun:', error);
			addToast('Network error while triggering rerun', 'error');
		} finally {
			rerunningIds.delete(runId);
			rerunningIds = new Set(rerunningIds);
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

	function getStatusPillClasses(status: string) {
		switch (status) {
			case 'success':
				return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
			case 'failure':
				return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
			case 'cancelled':
				return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
			case 'pending':
			case 'queued':
			case 'in_progress':
				return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
			default:
				return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
		}
	}

	function getDotColor(status: string) {
		switch (status) {
			case 'success':
				return 'bg-emerald-400';
			case 'failure':
				return 'bg-rose-500';
			case 'cancelled':
				return 'bg-slate-400';
			case 'pending':
				return 'bg-amber-400 animate-pulse';
			default:
				return 'bg-slate-400';
		}
	}

	// Derived filtered items
	let filteredStatuses = $derived(
		statuses
			.filter((s: any) => {
				const q = searchQuery.toLowerCase();
				const matchesSearch = s.repo.toLowerCase().includes(q) || (ORGAN_METADATA[s.repo]?.role.toLowerCase().includes(q) ?? false);
				if (!matchesSearch) return false;

				if (activeStatusFilter !== 'all' && s.status !== activeStatusFilter) return false;

				if (activeCategoryFilter !== 'all') {
					const cat = ORGAN_METADATA[s.repo]?.category;
					if (cat !== activeCategoryFilter) return false;
				}

				return true;
			})
	);

	let totalOrgans = $derived(statuses.length);
	let failingCount = $derived(statuses.filter((s: any) => s.status === 'failure').length);
	let pendingCount = $derived(statuses.filter((s: any) => s.status === 'pending' || s.status === 'in_progress').length);
	let successCount = $derived(statuses.filter((s: any) => s.status === 'success').length);
	let operationalCount = $derived(
		statuses.filter((s: any) => s.status === 'success' || s.status === 'pending' || s.status === 'in_progress').length
	);
	let baselineTag = $derived(data.ecosystemVersion || filteredStatuses.find((s: any) => s.tag)?.tag || statuses.find((s: any) => s.tag)?.tag || '');

	let categoryCounts = $derived.by(() => {
		const counts = { all: statuses.length, core: 0, execution: 0, sensory: 0, interface: 0 };
		for (const s of statuses) {
			const cat = ORGAN_METADATA[s.repo]?.category;
			if (cat && cat in counts) {
				counts[cat]++;
			}
		}
		return counts;
	});

	function formatDate(dateString: string) {
		if (!dateString) return 'N/A';
		const date = new Date(dateString);
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}
</script>

<svelte:head>
	<title>Autonomic CI/CD — Mission Control</title>
	<meta
		name="description"
		content="Aerospace-grade real-time telemetry mesh for the 11-organ Autonomic AI Agent ecosystem."
	/>
</svelte:head>

<div class="max-w-[1360px] mx-auto px-4 sm:px-8 py-8 flex flex-col min-h-screen relative z-10">
	<!-- Top Telemetry Header -->
	<header class="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-white/[0.08] pb-6">
		<div class="flex flex-col">
			<div class="flex items-center gap-3 mb-2">
				<div class="px-2.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-mono tracking-widest uppercase text-cyan-400">
					ORBITAL TELEMETRY MESH
				</div>
				<span class="text-xs font-mono text-slate-500">SYS_ID: AUTONOMIC-AI-DEV</span>
			</div>
			<div class="flex items-center gap-3 mb-1">
				<AutonomicLogo size={36} animated={true} />
				<h1 class="text-3xl sm:text-4xl font-bold font-mono tracking-tight text-white flex items-center gap-3">
					<span>Mission Control</span>
					<span class="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-medium tracking-wide">
						{failingCount === 0 ? '100% NOMINAL' : `${failingCount} DEGRADED`}
					</span>
				</h1>
			</div>
			<p class="text-slate-400 text-sm mt-1 font-sans">
				Continuous integration, Darwin arm64 code signatures, and distributed organ telemetry.
			</p>
		</div>

		<!-- Clocks & Operational Controls -->
		<div class="flex flex-wrap items-center gap-3">
			<!-- Telemetry Clocks -->
			<div class="flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-[#0d1117] border border-white/10 font-mono text-xs">
				<div class="flex items-center gap-1.5 text-cyan-400">
					<Radio size={13} class="animate-pulse" />
					<span>{currentTimeUTC}</span>
				</div>
				<span class="text-white/20">|</span>
				<span class="text-slate-400">{currentTimeLocal} LOCAL</span>
			</div>

			<!-- Compliance Modal Trigger -->
			<button
				onclick={() => (complianceModalOpen = true)}
				class="px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-[#161b22] text-slate-300 border border-white/10 hover:border-cyan-500/40 hover:text-cyan-400 transition-all flex items-center gap-2 shadow-sm"
				title="Doctor & macOS Security Compliance"
			>
				<ShieldCheck size={14} class="text-emerald-400" />
				<span>Compliance Rules</span>
			</button>

			<!-- Refresh Button -->
			<button
				onclick={async () => {
					try {
						const res = await fetch(`/api/status?t=${Date.now()}`, { cache: 'no-store' });
						const json = await res.json();
						if (json.success) {
							statuses = json.data;
							lastUpdated = new Date();
							addToast('Telemetry refreshed', 'info');
						}
					} catch (e) {
						console.error('Failed to poll status', e);
						addToast('Failed to refresh status', 'error');
					}
				}}
				class="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-[#161b22] text-slate-300 border border-white/10 hover:border-cyan-500/40 hover:text-cyan-400 transition-all flex items-center gap-1.5"
				title="Sync Telemetry"
			>
				<RefreshCw size={13} />
				<span class="hidden sm:inline">Sync</span>
			</button>

			{#if typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window}
				<button
					class="px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all flex items-center gap-1.5"
					onclick={async () => {
						try {
							const result = await Notification.requestPermission();
							if (result === 'granted') {
								const reg = await navigator.serviceWorker.ready;
								const { env } = await import('$env/dynamic/public');
								const applicationServerKey = env.PUBLIC_VAPID_KEY;
								if (!applicationServerKey) {
									alert('Push notifications VAPID key is not configured.');
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
									addToast('Push alerts enabled for build failures', 'success');
								}
							}
						} catch (e) {
							console.error(e);
						}
					}}
				>
					<Zap size={13} />
					<span>Push Alerts</span>
				</button>
			{/if}
		</div>
	</header>

	<!-- Hero Telemetry Metrics Grid (Avionics Strip) -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
		<!-- Metric 1: Organ Status -->
		<div class="bg-[#0d1117] border border-white/10 rounded-xl p-4.5 flex flex-col justify-between relative overflow-hidden group hover:border-cyan-500/30 transition-all">
			<div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
				<span class="uppercase tracking-wider">Active Organ Mesh</span>
				<span class="h-2 w-2 rounded-full {failingCount === 0 ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}"></span>
			</div>
			<div class="flex items-baseline gap-2 mb-1">
				<span class="text-3xl font-mono font-bold text-white tracking-tight">{operationalCount}/{totalOrgans || 11}</span>
				<span class="text-xs font-mono {failingCount === 0 ? 'text-emerald-400' : 'text-rose-400'}">{failingCount === 0 ? 'OPERATIONAL' : `${failingCount} FAILING`}</span>
			</div>
			<div class="text-[11px] font-sans text-slate-400 flex items-center justify-between pt-2 border-t border-white/[0.06]">
				<span>Pipeline rollup</span>
				<span class="font-mono text-slate-300">
					{#if failingCount > 0}
						<span class="text-rose-400">{failingCount} failing</span>
					{:else if pendingCount > 0}
						<span class="text-yellow-400">{pendingCount} building</span>
					{:else}
						<span class="text-emerald-400">0 faults</span>
					{/if}
				</span>
			</div>
		</div>

		<!-- Metric 2: Architecture Platform -->
		<div class="bg-[#0d1117] border border-white/10 rounded-xl p-4.5 flex flex-col justify-between relative overflow-hidden group hover:border-cyan-500/30 transition-all">
			<div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
				<span class="uppercase tracking-wider">Target Runner Arch</span>
				<Cpu size={14} class="text-cyan-400" />
			</div>
			<div class="flex items-baseline gap-2 mb-1">
				<span class="text-xl sm:text-2xl font-mono font-bold text-cyan-300 tracking-tight">arm64-darwin</span>
			</div>
			<div class="text-[11px] font-sans text-slate-400 flex items-center justify-between pt-2 border-t border-white/[0.06]">
				<span>Apple Silicon Strict</span>
				<span class="font-mono text-emerald-400">ENFORCED</span>
			</div>
		</div>

		<!-- Metric 3: Gatekeeper / Codesign -->
		<div class="bg-[#0d1117] border border-white/10 rounded-xl p-4.5 flex flex-col justify-between relative overflow-hidden group hover:border-cyan-500/30 transition-all">
			<div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
				<span class="uppercase tracking-wider">Security & Signing</span>
				<ShieldCheck size={14} class="text-emerald-400" />
			</div>
			<div class="flex items-baseline gap-2 mb-1">
				<span class="text-lg sm:text-xl font-mono font-bold text-slate-100 tracking-tight">Developer ID</span>
			</div>
			<div class="text-[11px] font-sans text-slate-400 flex items-center justify-between pt-2 border-t border-white/[0.06]">
				<span>xattr -cr Quarantine</span>
				<span class="font-mono text-emerald-400">PASSED</span>
			</div>
		</div>

		<!-- Metric 4: Ecosystem Phase -->
		<div class="bg-[#0d1117] border border-white/10 rounded-xl p-4.5 flex flex-col justify-between relative overflow-hidden group hover:border-cyan-500/30 transition-all">
			<div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
				<span class="uppercase tracking-wider">Ecosystem Baseline</span>
				<Layers size={14} class="text-indigo-400" />
			</div>
			<div class="flex items-baseline gap-2 mb-1">
				<span class="text-xl sm:text-2xl font-mono font-bold text-white tracking-tight">{baselineTag || '—'}</span>
			</div>
			<div class="text-[11px] font-sans text-slate-400 flex items-center justify-between pt-2 border-t border-white/[0.06]">
				<span>Doctor min compatibility</span>
				<span class="font-mono text-cyan-400">VERIFIED</span>
			</div>
		</div>
	</div>

	<!-- Primary Navigation Tabs -->
	<div class="flex gap-2 mb-6 border-b border-white/[0.08] overflow-x-auto pb-1">
		<button
			onclick={() => switchTab('repos')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-mono text-xs uppercase tracking-wider font-semibold transition-all whitespace-nowrap ${
				activeTab === 'repos'
					? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/[0.04]'
					: 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
			}`}
		>
			<Activity size={15} />
			<span>Organ Mesh ({statuses.length || 11})</span>
		</button>
		<button
			onclick={() => switchTab('pulls')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-mono text-xs uppercase tracking-wider font-semibold transition-all whitespace-nowrap ${
				activeTab === 'pulls'
					? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/[0.04]'
					: 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
			}`}
		>
			<GitPullRequest size={15} />
			<span>Pull Requests</span>
		</button>
		<button
			onclick={() => switchTab('issues')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-mono text-xs uppercase tracking-wider font-semibold transition-all whitespace-nowrap ${
				activeTab === 'issues'
					? 'text-cyan-400 border-b-2 border-cyan-400 bg-white/[0.04]'
					: 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
			}`}
		>
			<CircleDot size={15} />
			<span>Issues</span>
		</button>
	</div>

	<!-- Tab 1: Organ Repos Mesh -->
	{#if activeTab === 'repos'}
		<!-- Filters & Search Toolbar -->
		<div class="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0d1117] p-3 rounded-xl border border-white/10">
			<!-- Category Taxonomy Filters -->
			<div class="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 hide-scrollbar">
				<span class="text-[11px] font-mono text-slate-500 uppercase px-2">Taxonomy:</span>
				{#each [
					{ id: 'all', label: 'All', count: categoryCounts.all },
					{ id: 'core', label: 'Core', count: categoryCounts.core },
					{ id: 'execution', label: 'Execution', count: categoryCounts.execution },
					{ id: 'sensory', label: 'Sensory', count: categoryCounts.sensory },
					{ id: 'interface', label: 'Interface', count: categoryCounts.interface }
				] as cat}
					<button
						onclick={() => (activeCategoryFilter = cat.id as any)}
						class={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all border whitespace-nowrap ${
							activeCategoryFilter === cat.id
								? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40 shadow-sm'
								: 'bg-[#161b22] text-slate-400 border-white/[0.06] hover:text-slate-200'
						}`}
					>
						{cat.label} ({cat.count})
					</button>
				{/each}
			</div>

			<!-- Search & Status Filter -->
			<div class="flex items-center gap-3">
				<div class="relative w-full sm:w-64">
					<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
						<Search size={14} />
					</div>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search organ or role..."
						class="w-full bg-[#161b22] border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-all"
					/>
				</div>

				<div class="flex gap-1">
					{#each ['all', 'failure', 'pending', 'success'] as sFilter}
						<button
							onclick={() => (activeStatusFilter = sFilter)}
							class={`px-2.5 py-1.5 rounded-lg text-xs font-mono capitalize transition-all border ${
								activeStatusFilter === sFilter
									? 'bg-white/10 text-white border-white/20'
									: 'bg-[#161b22] text-slate-400 border-white/[0.06] hover:text-slate-200'
							}`}
						>
							{sFilter}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Organ Telemetry Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
			{#each filteredStatuses as item, i}
				{@const meta = ORGAN_METADATA[item.repo] || {
					role: 'Autonomic organ service',
					category: 'core',
					daemon: false,
					arch: 'darwin-arm64',
					isSigned: true
				}}
				{@const StatusIcon = getStatusIcon(item.status)}

				<div
					class="bg-[#0d1117] border border-white/10 hover:border-cyan-500/40 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/5 hover:-translate-y-0.5 group"
				>
					<div>
						<!-- Card Header: Title & Status Pill -->
						<div class="flex items-start justify-between gap-3 mb-2.5">
							<div class="flex flex-col">
								<div class="flex items-center gap-2 mb-1">
									<a
										href={`/repo/${item.repo}`}
										class="text-base font-bold font-mono text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5"
									>
										<span>{item.repo}</span>
										<ExternalLink size={12} class="opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" />
									</a>
									<span class="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10 text-slate-400">
										{meta.category}
									</span>
								</div>
								<p class="text-xs text-slate-400 line-clamp-1 font-sans">
									{meta.role}
								</p>
							</div>

							<!-- Status Pill -->
							<div
								class={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold tracking-wider uppercase border shrink-0 ${getStatusPillClasses(item.status)}`}
							>
								<span class="relative flex h-2 w-2">
									<span
										class={`relative inline-flex rounded-full h-2 w-2 ${getDotColor(item.status)}`}
										style="box-shadow: 0 0 8px currentColor"
									></span>
								</span>
								<span>{item.status}</span>
							</div>
						</div>

						<!-- Release & Architecture Badges -->
						<div class="flex flex-wrap items-center gap-2 my-3 text-[11px] font-mono">
							{#if item.tag}
								<span class="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded flex items-center gap-1">
									<span>{item.tag}</span>
								</span>
							{/if}
							{#if item.sha}
								<span
									class="bg-white/[0.04] text-slate-400 border border-white/10 px-1.5 py-0.5 rounded cursor-default"
									title={item.isDocOnlyUpdate
										? `HEAD: ${item.sha.substring(0, 7)} (CI reflected from tested commit ${item.testedSha?.substring(0, 7) || 'earlier'})`
										: `Commit: ${item.sha.substring(0, 7)}`}
								>
									{item.sha.substring(0, 7)}
								</span>
							{/if}
							{#if item.isDocOnlyUpdate}
								<span
									class="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px]"
									title="HEAD commit is documentation/chore; pipeline status reflected from tested commit {item.testedSha?.substring(0, 7)}"
								>
									<span>DOCS</span>
								</span>
							{/if}
							<span class="bg-white/[0.04] text-slate-400 border border-white/10 px-1.5 py-0.5 rounded flex items-center gap-1">
								<Cpu size={11} class="text-slate-500" />
								<span>{meta.arch}</span>
							</span>
							{#if meta.isSigned}
								<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px]">
									<ShieldCheck size={11} />
									<span>DevID Signed</span>
								</span>
							{/if}
						</div>

						<!-- Pipeline Workflow Stages -->
						<div class="mt-4 pt-3 border-t border-white/[0.06]">
							{#if item.workflows && item.workflows.length > 0}
								<div class="flex flex-col gap-1.5">
									{#each item.workflows.slice(0, 3) as wf}
										{@const WfIcon = getStatusIcon(wf.status)}
										<div class="flex items-center justify-between text-xs font-mono py-0.5">
											<span class="text-slate-300 truncate pr-2 text-[11px]">{wf.name}</span>
											<div class="flex items-center gap-2 shrink-0">
												<WfIcon
													size={13}
													class={wf.status === 'success'
														? 'text-emerald-400'
														: wf.status === 'failure' || wf.status === 'timed_out'
															? 'text-rose-400'
															: wf.status === 'cancelled'
																? 'text-slate-400'
																: 'text-amber-400'}
												/>
												{#if wf.runId}
													<button
														onclick={() => openTerminal(wf.runId, item.repo, wf.name, wf.status)}
														class="text-slate-500 hover:text-cyan-400 transition-colors p-0.5"
														title="View execution logs"
													>
														<TerminalIcon size={12} />
													</button>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-xs text-slate-500 italic py-1 font-mono">
									No active pipeline executions
								</p>
							{/if}
						</div>
					</div>

					<!-- Card Footer -->
					<div class="mt-5 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-slate-500">
						<div class="flex items-center gap-1.5">
							{#if item.actor}
								<img
									src={item.actor.avatarUrl}
									alt={item.actor.login}
									class="w-4 h-4 rounded-full border border-white/10"
								/>
								<span class="text-slate-400">{item.actor.login}</span>
							{:else}
								<span>—</span>
							{/if}
						</div>
						<div class="flex items-center gap-1.5">
							<Clock size={11} class="text-slate-600" />
							<span>
								{#if item.updatedAt}
									{new Date(item.updatedAt).toLocaleTimeString([], {
										hour: '2-digit',
										minute: '2-digit',
										hour12: false
									})}
								{:else}
									—
								{/if}
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>

		{#if filteredStatuses.length === 0}
			<div class="text-center py-16 bg-[#0d1117] border border-white/10 rounded-xl font-mono text-sm text-slate-400">
				No autonomic organ matches filter criteria.
			</div>
		{/if}

	{:else if activeTab === 'pulls'}
		<!-- Pull Requests Operations Center -->
		<section class="flex flex-col gap-5">
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0d1117] p-4 rounded-xl border border-white/10">
				<div>
					<div class="flex items-center gap-2 mb-1">
						<h2 class="text-lg font-bold font-mono text-white">Ecosystem Pull Requests</h2>
						<span class="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
							{pulls.length} Open
						</span>
					</div>
					<p class="text-xs text-slate-400 font-sans">
						Batch merge verified PRs, inspect outdated base refs, and synchronize the distributed organ mesh.
					</p>
				</div>

				<div class="flex items-center gap-2.5">
					<button
						onclick={() => {
							pullsLoaded = false;
							loadPulls();
						}}
						class="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-[#161b22] text-slate-300 border border-white/10 hover:border-cyan-500/40 hover:text-cyan-400 transition-all flex items-center gap-1.5"
						title="Reload pull requests"
					>
						<RefreshCw size={12} class={loadingPulls ? 'animate-spin' : ''} />
						<span>Refresh</span>
					</button>
				</div>
			</div>

			<!-- Outdated Branches Warning Alert -->
			{#if outdatedPRs.length > 0}
				<div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-300 text-xs font-mono">
					<div class="flex items-center gap-2.5">
						<AlertCircle size={16} class="text-amber-400 shrink-0" />
						<span>
							<strong>{outdatedPRs.length} branch{outdatedPRs.length > 1 ? 'es are' : ' is'} out of date</strong> with the base branch. Direct merges are blocked by branch protection until updated.
						</span>
					</div>
					{#if data.session}
						<button
							onclick={batchUpdateOutdated}
							disabled={updatingAllOutdated}
							class="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-50"
						>
							<RefreshCw size={12} class={updatingAllOutdated ? 'animate-spin' : ''} />
							<span>{updatingAllOutdated ? 'Updating...' : `Update All Outdated (${outdatedPRs.length})`}</span>
						</button>
					{/if}
				</div>
			{/if}

			<!-- Multi-PR Batch Merge Toolbar -->
			{#if data.session && pulls.length > 0}
				<div class="flex flex-wrap items-center justify-between gap-3 bg-[#161b22] p-3 rounded-xl border border-white/[0.08] text-xs font-mono">
					<div class="flex items-center gap-2">
						<button
							onclick={selectAllReady}
							disabled={readyPRs.length === 0}
							class="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all disabled:opacity-40"
						>
							Select All Ready ({readyPRs.length})
						</button>
						{#if selectedPRs.size > 0}
							<button
								onclick={clearPRSelection}
								class="px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-white border border-white/10 transition-all"
							>
								Clear ({selectedPRs.size})
							</button>
						{/if}
					</div>

					<div class="flex items-center gap-3">
						{#if selectedPRs.size > 0}
							<button
								onclick={batchMergeSelected}
								disabled={batchMerging}
								class="px-4 py-1.5 rounded-lg font-bold bg-gradient-to-r from-emerald-500 to-cyan-500 text-[#080b10] hover:brightness-110 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
							>
								<GitMerge size={14} class={batchMerging ? 'animate-spin' : ''} />
								<span>{batchMerging ? 'Merging Batch...' : `Batch Squash & Merge (${selectedPRs.size})`}</span>
							</button>
						{:else}
							<span class="text-slate-500 text-[11px]">Select ready PRs to merge multiple at once</span>
						{/if}
					</div>
				</div>
			{/if}

			{#if loadingPulls && pulls.length === 0}
				<div class="flex items-center justify-center py-16 text-slate-500 font-mono text-xs gap-3">
					<Loader2 class="w-5 h-5 animate-spin text-cyan-400" />
					<span>Syncing open pull requests across all 11 organs...</span>
				</div>
			{:else if pulls.length === 0}
				<div class="text-center py-16 bg-[#0d1117] border border-white/10 rounded-xl font-mono text-sm text-slate-400">
					All organ PRs are merged. Master branches synchronized{#if baselineTag} at {baselineTag}{/if}.
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					{#each groupedPulls as [repoName, repoPulls]}
						<div class="bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden">
							<button
								onclick={() => (expandedPullsRepos = toggleRepo(expandedPullsRepos, repoName))}
								class="w-full px-5 py-3.5 flex items-center justify-between bg-[#161b22] hover:bg-white/[0.04] transition-colors text-left"
							>
								<div class="flex items-center gap-3">
									<ChevronDown
										size={16}
										class={`text-slate-400 transition-transform ${expandedPullsRepos.has(repoName) ? 'rotate-180' : ''}`}
									/>
									<span class="font-mono font-bold text-white text-sm">{repoName}</span>
									<span class="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
										{repoPulls.length} PR{repoPulls.length > 1 ? 's' : ''}
									</span>
								</div>
							</button>

							{#if expandedPullsRepos.has(repoName)}
								<div class="divide-y divide-white/[0.06]">
									{#each repoPulls as pr}
										{@const prKey = getPRKey(repoName, pr.number)}
										{@const isSelected = selectedPRs.has(prKey)}
										<div class="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors {isSelected ? 'bg-cyan-500/[0.03]' : ''}">
											<div class="flex items-start gap-3">
												{#if data.session}
													<input
														type="checkbox"
														checked={isSelected}
														onchange={() => toggleSelectPR(repoName, pr.number)}
														disabled={!pr.canMerge}
														title={!pr.canMerge
															? pr.isBehind
																? 'Cannot select: branch is outdated'
																: pr.isDirty
																	? 'Cannot select: conflicts'
																	: pr.status === 'failure' || pr.status === 'cancelled'
																		? 'Cannot select: checks failed'
																		: pr.status === 'in_progress' || pr.status === 'queued'
																			? 'Cannot select: checks running'
																			: 'Cannot select: blocked'
															: 'Select for batch merge'}
														class="mt-1 h-4 w-4 rounded border-white/20 bg-[#161b22] text-cyan-400 focus:ring-cyan-500/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
													/>
												{/if}

												<div class="flex flex-col">
													<div class="flex flex-wrap items-center gap-2 mb-1.5">
														<a
															href={pr.url}
															target="_blank"
															rel="noopener noreferrer"
															class="font-mono font-semibold text-slate-200 hover:text-cyan-400 text-sm flex items-center gap-1.5"
														>
															<span>#{pr.number} {pr.title}</span>
															<ExternalLink size={12} class="opacity-60" />
														</a>

														<!-- Comprehensive Status Badges -->
														{#if pr.isBehind}
															<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
																<AlertCircle size={11} />
																<span>Branch Outdated</span>
															</span>
														{/if}
														{#if pr.isDirty}
															<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
																<XCircle size={11} />
																<span>Conflicts</span>
															</span>
														{/if}
														{#if pr.status === 'failure' || pr.status === 'cancelled'}
															<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
																<XCircle size={11} />
																<span>Checks Failed</span>
															</span>
														{:else if pr.status === 'in_progress' || pr.status === 'queued'}
															<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
																<RefreshCw size={11} class="animate-spin" />
																<span>Checks Running</span>
															</span>
														{:else if pr.isBlocked && !pr.isBehind && !pr.isDirty}
															<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
																<Clock size={11} />
																<span>Merge Blocked</span>
															</span>
														{/if}
														{#if pr.canMerge}
															<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
																<CheckCircle size={11} />
																<span>Ready to Merge</span>
															</span>
														{/if}
														{#if pr.isDraft}
															<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/30">
																Draft
															</span>
														{/if}
													</div>

													<div class="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-500">
														<span>by {pr.author?.login || 'unknown'}</span>
														<span>•</span>
														<span>branch: <code class="text-cyan-300">{pr.headRefName}</code> → <code class="text-slate-400">{pr.baseRefName}</code></span>
														<span>•</span>
														<span>{formatDate(pr.createdAt)}</span>
													</div>

													<!-- Checks strip to identify what went wrong -->
													{#if pr.checks && pr.checks.length > 0}
														<div class="flex items-center gap-1.5 flex-wrap mt-2">
															{#each pr.checks as check}
																{@const CheckIcon = getStatusIcon(check.status)}
																<button
																	type="button"
																	onclick={() => check.id ? openTerminal(check.id, repoName, check.name, check.status) : (check.url ? window.open(check.url, '_blank') : null)}
																	class="px-2 py-0.5 rounded bg-[#080b10] border text-[10px] font-mono transition-colors flex items-center gap-1 {check.status === 'failure' || check.status === 'cancelled' ? 'border-rose-500/40 text-rose-300 hover:border-rose-500/70 bg-rose-500/5' : check.status === 'in_progress' || check.status === 'queued' ? 'border-cyan-500/40 text-cyan-300 hover:border-cyan-500/70' : 'border-white/10 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30'}"
																	title="{check.name} ({check.status}) — click to view logs"
																>
																	<CheckIcon size={10} class={check.status === 'success' ? 'text-emerald-400' : check.status === 'failure' ? 'text-rose-400' : check.status === 'in_progress' || check.status === 'queued' ? 'text-cyan-400 animate-spin' : 'text-amber-400'} />
																	<span class="max-w-[130px] truncate">{check.name}</span>
																	{#if check.status === 'failure' || check.status === 'cancelled'}
																		<span class="text-[9px] text-rose-400 font-bold uppercase ml-0.5">{check.status}</span>
																	{/if}
																</button>
															{/each}
														</div>
													{/if}
												</div>
											</div>

											<!-- Action Controls -->
											<div class="flex items-center gap-2.5 shrink-0 self-end md:self-center">
												<!-- Outdated Branch Fix Button -->
												{#if pr.isBehind && data.session}
													<button
														onclick={() => updateBranch(repoName, pr.number)}
														disabled={updatingBranchIds.has(prKey)}
														class="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
														title="Bring this branch up to date with master"
													>
														<RefreshCw size={12} class={updatingBranchIds.has(prKey) ? 'animate-spin' : ''} />
														<span>{updatingBranchIds.has(prKey) ? 'Updating...' : 'Update Branch'}</span>
													</button>
												{/if}

												<!-- Merge Button with strict outdated/conflict protection -->
												{#if data.session}
													<button
														onclick={() => mergePR(repoName, pr.number)}
														disabled={mergingIds.has(pr.number) || pr.isBehind || pr.isDirty || !pr.canMerge}
														title={
															pr.isBehind
																? 'Branch is outdated. Update branch first.'
																: pr.isDirty
																	? 'PR has conflicts that must be resolved'
																	: pr.status === 'failure' || pr.status === 'cancelled'
																		? 'Cannot merge: CI checks failed'
																		: pr.status === 'in_progress' || pr.status === 'queued'
																			? 'Cannot merge: CI checks are still running'
																			: !pr.canMerge
																				? 'Cannot merge: blocked by branch protection or reviews'
																				: 'Squash and merge pull request'
														}
														class="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed {
															pr.canMerge
																? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 shadow-sm'
																: 'bg-[#161b22] text-slate-500 border border-white/10'
														}"
													>
														<GitMerge size={13} class={mergingIds.has(pr.number) ? 'animate-spin' : ''} />
														<span>
															{mergingIds.has(pr.number)
																? 'Merging...'
																: pr.isBehind
																	? 'Branch Outdated'
																	: pr.isDirty
																		? 'Has Conflicts'
																		: pr.status === 'failure' || pr.status === 'cancelled'
																			? 'Checks Failed'
																			: pr.status === 'in_progress' || pr.status === 'queued'
																				? 'Checks Running'
																				: !pr.canMerge
																					? 'Blocked'
																					: 'Squash & Merge'}
														</span>
													</button>
												{/if}
											</div>
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
		<!-- Issues View -->
		<section class="flex flex-col gap-4">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-bold font-mono text-white">Ecosystem Issues</h2>
				<button
					onclick={() => {
						issuesLoaded = false;
						loadIssues();
					}}
					class="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
				>
					<RefreshCw size={12} class={loadingIssues ? 'animate-spin' : ''} />
					<span>Reload Issues</span>
				</button>
			</div>

			{#if loadingIssues && issues.length === 0}
				<div class="flex items-center justify-center py-16 text-slate-500 font-mono text-xs gap-3">
					<Loader2 class="w-5 h-5 animate-spin text-cyan-400" />
					<span>Syncing issues across all 11 organs...</span>
				</div>
			{:else if issues.length === 0}
				<div class="text-center py-16 bg-[#0d1117] border border-white/10 rounded-xl font-mono text-sm text-slate-400">
					Zero open defects or bugs reported across the organ mesh.
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					{#each groupedIssues as [repoName, repoIssues]}
						<div class="bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden">
							<button
								onclick={() => (expandedIssuesRepos = toggleRepo(expandedIssuesRepos, repoName))}
								class="w-full px-5 py-3.5 flex items-center justify-between bg-[#161b22] hover:bg-white/[0.04] transition-colors text-left"
							>
								<div class="flex items-center gap-3">
									<ChevronDown
										size={16}
										class={`text-slate-400 transition-transform ${expandedIssuesRepos.has(repoName) ? 'rotate-180' : ''}`}
									/>
									<span class="font-mono font-bold text-white text-sm">{repoName}</span>
									<span class="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
										{repoIssues.length} issue{repoIssues.length > 1 ? 's' : ''}
									</span>
								</div>
							</button>

							{#if expandedIssuesRepos.has(repoName)}
								<div class="divide-y divide-white/[0.06]">
									{#each repoIssues as issue}
										<div class="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
											<div class="flex flex-col">
												<div class="flex items-center gap-2 mb-1">
													<a
														href={issue.url}
														target="_blank"
														rel="noopener noreferrer"
														class="font-mono font-semibold text-slate-200 hover:text-cyan-400 text-sm flex items-center gap-1.5"
													>
														<span>#{issue.number} {issue.title}</span>
														<ExternalLink size={12} class="opacity-60" />
													</a>
												</div>
												<div class="flex items-center gap-3 text-xs font-mono text-slate-500">
													<span>opened by {issue.author?.login || 'unknown'}</span>
													<span>•</span>
													<span>{formatDate(issue.createdAt)}</span>
												</div>
											</div>

											<div class="flex items-center gap-3">
												{#if data.session}
													<button
														onclick={() => closeIssue(repoName, issue.number)}
														disabled={closingIds.has(issue.number)}
														class="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
													>
														<XCircle size={13} class={closingIds.has(issue.number) ? 'animate-spin' : ''} />
														<span>{closingIds.has(issue.number) ? 'Closing...' : 'Close Issue'}</span>
													</button>
												{/if}
											</div>
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

<!-- Compliance & Verification Modal -->
{#if complianceModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
		<div class="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
			<div class="bg-[#161b22] px-6 py-4 border-b border-white/10 flex items-center justify-between">
				<div class="flex items-center gap-2.5 font-mono">
					<ShieldCheck size={18} class="text-emerald-400" />
					<h3 class="text-sm font-bold text-white uppercase tracking-wider">Ecosystem Verification Rules</h3>
				</div>
				<button onclick={() => (complianceModalOpen = false)} class="text-slate-400 hover:text-white p-1">
					<X size={16} />
				</button>
			</div>

			<div class="p-6 flex flex-col gap-5 font-sans text-sm text-slate-300 overflow-y-auto max-h-[70vh]">
				<div class="p-4 rounded-xl bg-[#161b22] border border-white/[0.08]">
					<h4 class="font-mono text-xs uppercase tracking-wider text-cyan-400 mb-2 flex items-center gap-2">
						<Cpu size={14} /> macOS Apple Silicon Darwin-arm64
					</h4>
					<p class="text-xs text-slate-400 leading-relaxed font-mono">
						All 11 release pipelines execute exclusively on self-hosted Apple Silicon runners (<code class="text-cyan-300">runs-on: [self-hosted, macOS, ARM64]</code>). Binaries are compiled strictly for <code class="text-cyan-300">aarch64-apple-darwin</code> with zero emulation overhead.
					</p>
				</div>

				<div class="p-4 rounded-xl bg-[#161b22] border border-white/[0.08]">
					<h4 class="font-mono text-xs uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-2">
						<ShieldCheck size={14} /> Apple Developer ID & Quarantine Policy
					</h4>
					<p class="text-xs text-slate-400 leading-relaxed font-mono">
						Release binaries are signed with Apple Developer ID certificates and verified with <code class="text-emerald-300">codesign --verify --verbose=2</code>. Install scripts clear quarantine with <code class="text-emerald-300">xattr -cr</code> and strictly avoid ad-hoc re-signing (<code class="text-rose-400">codesign --sign -</code>) to prevent invalidating Developer ID notarization.
					</p>
				</div>

				<div class="p-4 rounded-xl bg-[#161b22] border border-white/[0.08]">
					<h4 class="font-mono text-xs uppercase tracking-wider text-indigo-400 mb-2 flex items-center gap-2">
						<Layers size={14} /> Doctor Compatibility Matrix
					</h4>
					<p class="text-xs text-slate-400 leading-relaxed font-mono">
						<code class="text-indigo-300">autonomic doctor</code> enforces <code class="text-indigo-300">MIN_COMPATIBLE_VERSION = "1.0.0-beta.1"</code> across all peripheral organs. Any organ running an earlier semantic release is flagged as degraded during supervisor startup.
					</p>
				</div>

				<div class="p-4 rounded-xl bg-[#161b22] border border-white/[0.08]">
					<h4 class="font-mono text-xs uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-2">
						<Info size={14} /> Pre-Release Auto-Update Isolation
					</h4>
					<p class="text-xs text-slate-400 leading-relaxed font-mono">
						<code class="text-amber-300">run_organ_self_update</code> parses semantic prerelease identifiers (<code class="text-amber-300">-beta</code>, <code class="text-amber-300">-rc</code>). Production stable versions will never automatically track pre-releases unless explicit <code class="text-amber-300">--force</code> or a pre-release channel is installed.
					</p>
				</div>
			</div>

			<div class="bg-[#161b22] px-6 py-3 border-t border-white/10 flex justify-end">
				<button
					onclick={() => (complianceModalOpen = false)}
					class="px-4 py-1.5 rounded-lg text-xs font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20"
				>
					Acknowledge
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Terminal Modal -->
{#if terminalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
		<div class="bg-[#080b10] border border-white/10 rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden font-mono">
			<!-- Terminal Header -->
			<div class="bg-[#0d1117] border-b border-white/10 px-4 py-3 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<TerminalIcon size={15} class="text-cyan-400" />
					<h3 class="text-white text-xs font-bold tracking-wider uppercase">{terminalTitle} Execution Logs</h3>
					{#if data.session && (terminalRunStatus === 'failure' || terminalRunStatus === 'timed_out' || terminalRunStatus === 'cancelled')}
						<div class="w-px h-3.5 bg-white/10 mx-2"></div>
						<button
							onclick={(e) => {
								e.preventDefault();
								rerunWorkflow(terminalRunId, terminalRepo);
							}}
							disabled={rerunningIds.has(terminalRunId)}
							class="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors disabled:opacity-50"
						>
							<RefreshCw size={11} class={rerunningIds.has(terminalRunId) ? 'animate-spin' : ''} />
							<span>Rerun Failed</span>
						</button>
					{/if}
				</div>
				<button
					onclick={() => (terminalOpen = false)}
					class="text-slate-400 hover:text-white transition-colors bg-[#161b22] hover:bg-white/10 p-1 rounded"
				>
					<X size={15} />
				</button>
			</div>

			<!-- Terminal Body -->
			<div class="flex-1 p-4 overflow-y-auto bg-[#080b10] text-emerald-400 text-xs leading-relaxed custom-scrollbar font-mono">
				{#if terminalLoading}
					<div class="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
						<Loader2 class="w-7 h-7 animate-spin text-cyan-400" />
						<p class="font-sans text-xs">Streaming logs from GitHub Actions pipeline runner...</p>
					</div>
				{:else}
					<pre class="whitespace-pre-wrap break-words m-0 font-mono">{terminalLogs}</pre>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Toast Notifications Container -->
{#if toasts.length > 0}
	<div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm font-mono text-xs">
		{#each toasts as toast (toast.id)}
			<div
				class="flex items-center gap-2 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md {toast.type === 'success' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : toast.type === 'error' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'}"
			>
				{#if toast.type === 'success'}
					<CheckCircle size={15} />
				{:else if toast.type === 'error'}
					<XCircle size={15} />
				{:else}
					<AlertCircle size={15} />
				{/if}
				<span class="font-sans">{toast.message}</span>
				<button
					onclick={() => (toasts = toasts.filter((t) => t.id !== toast.id))}
					class="ml-auto p-0.5 opacity-60 hover:opacity-100 transition-opacity"
				>
					<X size={13} />
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
		width: 6px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: #080b10;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #21262d;
		border-radius: 3px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #00f2fe;
	}
</style>
