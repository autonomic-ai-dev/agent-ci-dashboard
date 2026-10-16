<script lang="ts">
	import {
		ArrowLeft,
		FileText,
		Tag,
		Clock,
		Activity,
		CheckCircle,
		XCircle,
		AlertCircle,
		Loader2,
		RefreshCw,
		Terminal as TerminalIcon,
		X,
		GitPullRequest,
		CircleDot,
		GitMerge,
		User,
		Check,
		Copy,
		ShieldCheck,
		Cpu,
		ExternalLink,
		Layers,
		Terminal,
		Sliders,
		Play,
		CheckSquare,
		Square
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import mermaid from 'mermaid';
	import AutonomicLogo from '$lib/components/AutonomicLogo.svelte';

	let { data } = $props();

	type Tab = 'runs' | 'pulls' | 'readme' | 'releases' | 'issues';
	let activeTab = $derived.by<Tab>(() => {
		const tabParam = $page.url.searchParams.get('tab') as Tab | null;
		if (tabParam && ['runs', 'pulls', 'readme', 'releases', 'issues'].includes(tabParam)) return tabParam;
		return 'runs';
	});

	function switchTab(tab: Tab) {
		const url = new URL($page.url);
		if (tab === 'runs') url.searchParams.delete('tab');
		else url.searchParams.set('tab', tab);
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

	const ALL_ORGANS = [
		{ name: 'agent-body', role: 'Supervisor & Dispatcher' },
		{ name: 'agent-brain', role: 'Memory & Discovery' },
		{ name: 'agent-spine', role: 'YAML DAG Engine' },
		{ name: 'agent-heart', role: 'Token Budget & Guard' },
		{ name: 'agent-nerves', role: 'JetStream Bus' },
		{ name: 'agent-muscle', role: 'Execution Sandbox' },
		{ name: 'agent-immune', role: 'Security & Integrity' },
		{ name: 'agent-eyes', role: 'DOM & Visual Audit' },
		{ name: 'agent-mouth', role: 'Policy & Notifications' },
		{ name: 'agent-tui', role: 'Terminal Console' }
	];

	// State for infinite scrolling
	let releases = $state<any[]>([]);
	let releasesPageInfo = $state<any>({ hasNextPage: false, endCursor: null });
	let loadingReleases = $state(false);

	let commits = $state<any[]>([]);
	let commitsPageInfo = $state<any>({ hasNextPage: false, endCursor: null });
	let loadingCommits = $state(false);

	// PR State
	let pulls = $state<any[]>([]);
	let pullsPageInfo = $state<any>({ hasNextPage: false, endCursor: null });
	let loadingPulls = $state(false);
	let pullsLoaded = $state(false);

	// Issues State
	let issues = $state<any[]>([]);
	let issuesPageInfo = $state<any>({ hasNextPage: false, endCursor: null });
	let loadingIssues = $state(false);
	let issuesLoaded = $state(false);

	// Selection & Batch Merge State
	let selectedPRs = $state<Set<number>>(new Set());
	let batchMerging = $state(false);

	let readyPRs = $derived(pulls.filter((p) => p.canMerge));
	let outdatedPRs = $derived(pulls.filter((p) => p.isBehind));

	function toggleSelectPR(prNumber: number) {
		const next = new Set(selectedPRs);
		if (next.has(prNumber)) next.delete(prNumber);
		else next.add(prNumber);
		selectedPRs = next;
	}

	function selectAllReadyPRs() {
		if (selectedPRs.size === readyPRs.length && readyPRs.length > 0) {
			selectedPRs = new Set();
		} else {
			selectedPRs = new Set(readyPRs.map((p) => p.number));
		}
	}

	// Terminal Logs State
	let terminalOpen = $state(false);
	let terminalLogs = $state('');
	let terminalTitle = $state('');
	let terminalRunId = $state('');
	let terminalRunStatus = $state('');
	let terminalLoading = $state(false);

	// Quick install copy feedback
	let copiedBrew = $state(false);
	let copiedDoctor = $state(false);

	async function copyToClipboard(text: string, type: 'brew' | 'doctor') {
		try {
			await navigator.clipboard.writeText(text);
			if (type === 'brew') {
				copiedBrew = true;
				setTimeout(() => (copiedBrew = false), 2000);
			} else {
				copiedDoctor = true;
				setTimeout(() => (copiedDoctor = false), 2000);
			}
			addToast('Copied to clipboard', 'info');
		} catch (e) {
			console.error('Clipboard copy failed:', e);
		}
	}

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

	let rerunningIds = $state<Set<string>>(new Set());
	let mergingIds = $state<Set<number>>(new Set());
	let updatingBranchIds = $state<Set<number>>(new Set());
	let closingIds = $state<Set<number>>(new Set());

	$effect(() => {
		releases = data.releases || [];
		releasesPageInfo = data.releasesPageInfo || { hasNextPage: false, endCursor: null };
		commits = data.commits || [];
		commitsPageInfo = data.commitsPageInfo || { hasNextPage: false, endCursor: null };
	});

	$effect(() => {
		if ((activeTab === 'pulls' || activeTab === 'runs') && !pullsLoaded && (data.pullCount ?? 0) > 0) {
			pullsLoaded = true;
			loadPulls();
		}
		if (activeTab === 'issues' && !issuesLoaded && (data.issueCount ?? 0) > 0) {
			issuesLoaded = true;
			loadIssues();
		}
	});

	let observerTarget = $state<HTMLElement | null>(null);

	async function viewLogs(runId: string, title: string, status: string) {
		terminalOpen = true;
		terminalTitle = title;
		terminalRunId = runId;
		terminalRunStatus = status;
		terminalLogs = '';
		terminalLoading = true;

		try {
			const res = await fetch(`/api/repo/${data.repo}/logs?run_id=${runId}`);
			const json = await res.json();
			if (json.success) {
				terminalLogs = json.logs;
			} else {
				terminalLogs = `Error: ${json.error}`;
			}
		} catch (e) {
			terminalLogs = 'Failed to fetch logs.';
		} finally {
			terminalLoading = false;
		}
	}

	async function rerunWorkflow(runId: string, type: 'all' | 'failed' = 'failed') {
		rerunningIds = new Set([...rerunningIds, runId]);

		try {
			const response = await fetch(`/api/repo/${data.repo}/run`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ runId, type })
			});

			if (response.ok) {
				addToast('CI rerun triggered successfully', 'success');
				commits = [];
				loadingCommits = false;
				loadCommitsFromApi();
				if (terminalOpen) terminalOpen = false;
			} else {
				const res = await response.json();
				addToast(res.error || 'Failed to trigger rerun', 'error');
			}
		} catch (error) {
			console.error('Error triggering rerun:', error);
			addToast('Network error while triggering rerun', 'error');
		} finally {
			const next = new Set(rerunningIds);
			next.delete(runId);
			rerunningIds = next;
		}
	}

	async function rerunLatest() {
		const latestCommit = commits[0];
		const firstRun = latestCommit?.runs?.[0];
		if (firstRun?.id) {
			await rerunWorkflow(String(firstRun.id), 'all');
		} else {
			addToast('No CI workflow run found to rerun', 'info');
		}
	}

	async function loadCommitsFromApi() {
		loadingCommits = true;
		try {
			const res = await fetch(`/api/repo/${data.repo}/history?type=commits`);
			const json = await res.json();
			if (json.success) {
				commits = json.data;
				commitsPageInfo = json.pageInfo;
			}
		} catch (e) {
			console.error('Failed to reload commits', e);
		} finally {
			loadingCommits = false;
		}
	}

	async function loadPulls(after?: string) {
		if (loadingPulls) return;
		loadingPulls = true;
		try {
			const params = after ? `?after=${after}` : '';
			const res = await fetch(`/api/repo/${data.repo}/pulls${params}`);
			const json = await res.json();
			if (json.success) {
				pulls = after ? [...pulls, ...json.data] : json.data;
				pullsPageInfo = json.pageInfo;
			}
		} catch (e) {
			console.error('Failed to fetch PRs', e);
		} finally {
			loadingPulls = false;
		}
	}

	async function loadIssues(after?: string) {
		if (loadingIssues) return;
		loadingIssues = true;
		try {
			const params = after ? `?after=${after}` : '';
			const res = await fetch(`/api/repo/${data.repo}/issues${params}`);
			const json = await res.json();
			if (json.success) {
				issues = after ? [...issues, ...json.data] : json.data;
				issuesPageInfo = json.pageInfo;
			}
		} catch (e) {
			console.error('Failed to fetch issues', e);
		} finally {
			loadingIssues = false;
		}
	}

	async function updateBranch(pullNumber: number) {
		updatingBranchIds = new Set([...updatingBranchIds, pullNumber]);

		try {
			const res = await fetch(`/api/repo/${data.repo}/pulls/update-branch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pullNumber })
			});

			const json = await res.json();
			if (res.ok && json.success) {
				addToast(`Updated branch for PR #${pullNumber} with latest base`, 'success');
				pulls = [];
				pullsPageInfo = { hasNextPage: false, endCursor: null };
				loadingPulls = false;
				loadPulls();
			} else {
				addToast(json.error || 'Failed to update branch', 'error');
			}
		} catch (e) {
			console.error('Error updating branch:', e);
			addToast('Network error while updating branch', 'error');
		} finally {
			const next = new Set(updatingBranchIds);
			next.delete(pullNumber);
			updatingBranchIds = next;
		}
	}

	async function mergePR(pullNumber: number) {
		if (!confirm(`Squash and merge PR #${pullNumber}?`)) return;
		mergingIds = new Set([...mergingIds, pullNumber]);

		try {
			const res = await fetch(`/api/repo/${data.repo}/pulls/merge`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pullNumber })
			});

			const json = await res.json();
			if (res.ok && json.success) {
				pulls = pulls.filter((pr) => pr.number !== pullNumber);
				const nextSel = new Set(selectedPRs);
				nextSel.delete(pullNumber);
				selectedPRs = nextSel;
				addToast(`PR #${pullNumber} squashed & merged`, 'success');
			} else {
				addToast(json.error || 'Failed to merge PR', 'error');
			}
		} catch (e) {
			console.error('Error merging PR:', e);
			addToast('Network error while merging', 'error');
		} finally {
			const next = new Set(mergingIds);
			next.delete(pullNumber);
			mergingIds = next;
		}
	}

	async function batchMergeSelected() {
		if (selectedPRs.size === 0) return;
		if (!confirm(`Squash and merge all ${selectedPRs.size} selected pull requests?`)) return;

		batchMerging = true;
		const items = Array.from(selectedPRs).map((num) => ({ repo: data.repo, pullNumber: num }));

		try {
			const res = await fetch('/api/pulls/batch-merge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items })
			});

			const json = await res.json();
			if (res.ok && json.success) {
				const mergedCount = json.mergedCount || 0;
				addToast(`Batch merge complete: ${mergedCount}/${items.length} PRs merged!`, 'success');
				selectedPRs = new Set();
				pulls = [];
				pullsLoaded = false;
				loadPulls();
			} else {
				addToast(json.error || 'Batch merge finished with some errors', 'error');
			}
		} catch (e) {
			console.error('Batch merge error:', e);
			addToast('Network error during batch merge', 'error');
		} finally {
			batchMerging = false;
		}
	}

	async function closeIssue(issueNumber: number) {
		if (!confirm(`Close issue #${issueNumber}?`)) return;
		closingIds = new Set([...closingIds, issueNumber]);

		try {
			const res = await fetch(`/api/repo/${data.repo}/issues/close`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ issueNumber })
			});

			if (res.ok) {
				issues = issues.filter((issue) => issue.number !== issueNumber);
				addToast(`Issue #${issueNumber} closed`, 'success');
			} else {
				const json = await res.json();
				addToast(json.error || 'Failed to close issue', 'error');
			}
		} catch (e) {
			console.error('Error closing issue:', e);
			addToast('Network error while closing issue', 'error');
		} finally {
			const next = new Set(closingIds);
			next.delete(issueNumber);
			closingIds = next;
		}
	}

	// Load more function for infinite scroll
	async function loadMore() {
		if (activeTab === 'releases' && releasesPageInfo.hasNextPage && !loadingReleases) {
			loadingReleases = true;
			try {
				const res = await fetch(
					`/api/repo/${data.repo}/history?type=releases&after=${releasesPageInfo.endCursor}`
				);
				const json = await res.json();
				if (json.success) {
					releases = [...releases, ...json.data];
					releasesPageInfo = json.pageInfo;
				}
			} catch (e) {
				console.error('Failed to load more releases', e);
			} finally {
				loadingReleases = false;
			}
		} else if (activeTab === 'runs' && commitsPageInfo.hasNextPage && !loadingCommits) {
			loadingCommits = true;
			try {
				const res = await fetch(
					`/api/repo/${data.repo}/history?type=commits&after=${commitsPageInfo.endCursor}`
				);
				const json = await res.json();
				if (json.success) {
					commits = [...commits, ...json.data];
					commitsPageInfo = json.pageInfo;
				}
			} catch (e) {
				console.error('Failed to load more commits', e);
			} finally {
				loadingCommits = false;
			}
		} else if (activeTab === 'pulls' && pullsPageInfo.hasNextPage && !loadingPulls) {
			loadPulls(pullsPageInfo.endCursor);
		} else if (activeTab === 'issues' && issuesPageInfo.hasNextPage && !loadingIssues) {
			loadIssues(issuesPageInfo.endCursor);
		}
	}

	mermaid.initialize({
		startOnLoad: false,
		theme: 'dark',
		themeVariables: {
			primaryColor: '#00f2fe',
			primaryTextColor: '#e2e8f0',
			primaryBorderColor: '#0891b2',
			lineColor: '#334155',
			secondaryColor: '#0d1117',
			tertiaryColor: '#161b22'
		}
	});

	async function copyCode(btn: HTMLButtonElement) {
		const pre = btn.closest('.code-block')?.querySelector('pre code');
		if (!pre) return;
		const text = pre.textContent || '';
		try {
			await navigator.clipboard.writeText(text);
			const label = btn.querySelector('.copy-label');
			if (label) {
				label.textContent = 'Copied!';
				setTimeout(() => {
					label.textContent = 'Copy';
				}, 2000);
			}
		} catch {
			/* ignore */
		}
	}

	$effect(() => {
		if (activeTab === 'readme') {
			const id = setTimeout(() => {
				document.querySelectorAll('.copy-btn').forEach((btn) => {
					btn.removeEventListener('click', copyClick);
					btn.addEventListener('click', copyClick);
				});
				mermaid.run({ querySelector: '.language-mermaid' }).catch(console.error);
			}, 200);
			return () => clearTimeout(id);
		}
	});

	function copyClick(e: Event) {
		copyCode(e.currentTarget as HTMLButtonElement);
	}

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					loadMore();
				}
			},
			{ rootMargin: '100px' }
		);

		$effect(() => {
			if (observerTarget) {
				observer.observe(observerTarget);
			}
			return () => {
				if (observerTarget) observer.unobserve(observerTarget);
			};
		});

		return () => observer.disconnect();
	});

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
				return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
			case 'failure':
				return 'text-red-400 bg-red-500/10 border-red-500/20';
			case 'cancelled':
				return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
			case 'pending':
			case 'queued':
			case 'in_progress':
				return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
			default:
				return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
		}
	}

	let latestStatus = $derived(commits && commits.length > 0 ? commits[0].status : 'unknown');
</script>

<svelte:head>
	<title>{data.repo} — Autonomic Mission Control</title>
	<meta
		name="description"
		content="Orbital avionics telemetry, CI/CD pipeline status, and release history for {data.repo}."
	/>
</svelte:head>

<!-- Toast Notification Container -->
<div class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
	{#each toasts as toast (toast.id)}
		<div
			class={`px-4 py-2.5 rounded-lg border text-xs font-mono shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-right duration-200 flex items-center gap-2 ${
				toast.type === 'success'
					? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
					: toast.type === 'error'
						? 'bg-red-950/90 border-red-500/40 text-red-300'
						: 'bg-[#161b22]/95 border-cyan-500/40 text-cyan-300'
			}`}
		>
			<span class="w-2 h-2 rounded-full {toast.type === 'success' ? 'bg-emerald-400' : toast.type === 'error' ? 'bg-red-400' : 'bg-cyan-400'}"></span>
			<span>{toast.message}</span>
		</div>
	{/each}
</div>

<!-- Main Avionics Deck -->
<div class="max-w-[1720px] mx-auto px-4 sm:px-6 py-6 flex flex-col min-h-[calc(100vh-4rem)] relative z-10 gap-6">

	<!-- Command Header & Breadcrumb HUD -->
	<header class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col gap-4">
		<!-- Top Meta HUD Bar -->
		<div class="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
			<!-- Breadcrumbs -->
			<div class="flex items-center gap-2 text-slate-400 flex-wrap">
				<a href="/" class="hover:text-cyan-400 transition-colors flex items-center gap-1.5">
					<ArrowLeft size={14} />
					<span>MISSION CONTROL</span>
				</a>
				<span class="text-white/20">/</span>
				<span class="text-slate-500">REPOSITORIES</span>
				<span class="text-white/20">/</span>
				<span class="text-cyan-300 font-bold tracking-wide">{data.repo}</span>
				<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase">
					ORGAN v1.0.0-b1
				</span>
			</div>

			<!-- System Indicators -->
			<div class="flex items-center gap-3">
				<div class="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-[#161b22] border border-white/10 text-slate-300 text-[11px]">
					<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
					<span>NODE_01 // ARM64_NATIVE</span>
					<span class="text-white/20">|</span>
					<span class="text-emerald-400">RTT: 1.2ms</span>
				</div>
				<div class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161b22] border border-white/10 text-slate-300 text-[11px]">
					<ShieldCheck size={13} class="text-emerald-400" />
					<span class="hidden md:inline">HARDENED RUNTIME:</span>
					<span class="text-emerald-400 font-semibold">CODESIGN VERIFIED</span>
				</div>
			</div>
		</div>

		<!-- Main Repo Title & Action Strip -->
		<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
			<div class="flex items-start sm:items-center gap-3.5">
				<AutonomicLogo size={42} animated={latestStatus === 'pending' || latestStatus === 'in_progress'} />
				<div class="flex flex-col">
					<div class="flex items-center gap-3 flex-wrap">
						<h1 class="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">
							{data.repo}
						</h1>
						<!-- Branch Pill -->
						<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#161b22] border border-white/10 text-xs font-mono text-slate-300">
							<span class="text-cyan-400">branch:</span>
							<span class="font-semibold text-white">{data.defaultBranch || 'master'}</span>
							{#if commits && commits.length > 0}
								<span class="text-slate-500">({commits[0].sha.substring(0, 7)})</span>
							{/if}
						</div>

						<!-- Latest Status Pill -->
						<div class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold uppercase border ${getStatusColorClasses(latestStatus)}`}>
							<span class="relative flex h-2 w-2">
								{#if latestStatus === 'pending' || latestStatus === 'in_progress'}
									<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
									<span class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
								{:else if latestStatus === 'success'}
									<span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
								{:else if latestStatus === 'failure'}
									<span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
								{:else}
									<span class="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
								{/if}
							</span>
							<span>{latestStatus}</span>
						</div>
					</div>
					{#if data.description}
						<p class="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl font-sans">
							{data.description}
						</p>
					{/if}
				</div>
			</div>

			<!-- Action Triggers -->
			<div class="flex items-center gap-2.5 shrink-0 flex-wrap">
				<button
					onclick={rerunLatest}
					class="px-3.5 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 text-[#080b10] font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(0,242,254,0.35)] hover:shadow-[0_0_22px_rgba(0,242,254,0.55)] transition-all active:scale-95"
				>
					<Play size={13} fill="currentColor" />
					<span>Trigger CI Run</span>
				</button>

				<a
					href={data.repoUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="px-3 py-2 rounded-lg bg-[#161b22] border border-white/15 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 font-mono text-xs font-medium flex items-center gap-1.5 transition-all"
				>
					<ExternalLink size={13} />
					<span>GitHub</span>
				</a>
			</div>
		</div>

		<!-- Navigation Tabs -->
		<div class="flex gap-2 border-t border-white/[0.08] pt-3 overflow-x-auto">
			<button
				onclick={() => switchTab('runs')}
				class={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
					activeTab === 'runs'
						? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
						: 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
				}`}
			>
				<Activity size={14} />
				<span>PIPELINE RUNS</span>
				{#if commits.length > 0}
					<span class="text-[10px] px-1.5 py-0.2 rounded bg-black/40 text-slate-400">{commits.length}</span>
				{/if}
			</button>

			<button
				onclick={() => switchTab('pulls')}
				class={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
					activeTab === 'pulls'
						? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
						: 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
				}`}
			>
				<GitPullRequest size={14} />
				<span>PULL REQUESTS</span>
				{#if data.pullCount > 0}
					<span class="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">{data.pullCount}</span>
				{/if}
			</button>

			<button
				onclick={() => switchTab('readme')}
				class={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
					activeTab === 'readme'
						? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
						: 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
				}`}
			>
				<FileText size={14} />
				<span>DOCUMENTATION</span>
			</button>

			<button
				onclick={() => switchTab('releases')}
				class={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
					activeTab === 'releases'
						? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
						: 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
				}`}
			>
				<Tag size={14} />
				<span>RELEASES</span>
				{#if releases.length > 0}
					<span class="text-[10px] px-1.5 py-0.2 rounded bg-black/40 text-slate-400">{releases.length}</span>
				{/if}
			</button>

			<button
				onclick={() => switchTab('issues')}
				class={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
					activeTab === 'issues'
						? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
						: 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
				}`}
			>
				<CircleDot size={14} />
				<span>ISSUES</span>
				{#if data.issueCount > 0}
					<span class="text-[10px] px-1.5 py-0.2 rounded bg-black/40 text-slate-400">{data.issueCount}</span>
				{/if}
			</button>
		</div>
	</header>

	<!-- Multi-Column Avionics Telemetry Grid -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

		<!-- LEFT PANEL: Subsystem Telemetry & Architecture (Cols 1-3) -->
		<aside class="lg:col-span-3 flex flex-col gap-4">

			<!-- Subsystem Role Card -->
			<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-md flex flex-col gap-3">
				<div class="flex items-center justify-between text-xs font-mono text-slate-400 pb-2 border-b border-white/[0.06]">
					<span class="text-cyan-400 font-semibold uppercase">SUBSYSTEM ARCHITECTURE</span>
					<Cpu size={14} class="text-cyan-400" />
				</div>
				<div class="flex flex-col gap-2 text-xs font-mono">
					<div class="flex justify-between items-center py-1 border-b border-white/[0.04]">
						<span class="text-slate-400">Target Triple:</span>
						<span class="text-slate-200 font-semibold">arm64-apple-darwin</span>
					</div>
					<div class="flex justify-between items-center py-1 border-b border-white/[0.04]">
						<span class="text-slate-400">Optimization:</span>
						<span class="text-emerald-400">Apple Silicon M-Series</span>
					</div>
					<div class="flex justify-between items-center py-1 border-b border-white/[0.04]">
						<span class="text-slate-400">Notarization:</span>
						<span class="text-emerald-400">Apple Developer ID Valid</span>
					</div>
					<div class="flex justify-between items-center py-1">
						<span class="text-slate-400">Release Tag:</span>
						<span class="text-cyan-300 font-semibold">v1.0.0-beta.1</span>
					</div>
				</div>
			</div>

			<!-- Homebrew Tap Card -->
			<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-md flex flex-col gap-3">
				<div class="flex items-center justify-between text-xs font-mono pb-2 border-b border-white/[0.06]">
					<span class="text-emerald-400 font-semibold uppercase">HOMEBREW DISTRIBUTION</span>
					<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
						LIVE & BOTTLED
					</span>
				</div>
				<div class="text-[11px] font-mono text-slate-400">
					Formula: <code class="text-cyan-300">autonomic-ai-dev/tap/{data.repo}</code>
				</div>
				<div class="relative bg-[#080b10] border border-white/10 rounded-lg p-2.5 flex items-center justify-between group">
					<span class="text-[11px] font-mono text-slate-300 truncate select-all">
						brew install {data.repo}
					</span>
					<button
						type="button"
						onclick={() => copyToClipboard(`brew install ${data.repo}`, 'brew')}
						class="text-slate-400 hover:text-cyan-400 transition-colors p-1"
						title="Copy Command"
					>
						{#if copiedBrew}
							<Check size={14} class="text-emerald-400" />
						{:else}
							<Copy size={14} />
						{/if}
					</button>
				</div>
			</div>

			<!-- Telemetry Quick Gauges -->
			<div class="grid grid-cols-2 gap-3">
				<div class="bg-[#0d1117]/80 border border-white/10 rounded-xl p-3 flex flex-col gap-1">
					<span class="text-[10px] font-mono uppercase text-slate-400 tracking-wider">Default Branch</span>
					<span class="text-lg font-bold font-mono text-cyan-400">{data.defaultBranch || 'master'}</span>
					<span class="text-[10px] font-mono text-slate-400">{commits.length} recent runs</span>
				</div>
				<div class="bg-[#0d1117]/80 border border-white/10 rounded-xl p-3 flex flex-col gap-1">
					<span class="text-[10px] font-mono uppercase text-slate-400 tracking-wider">Open PRs</span>
					<span class="text-lg font-bold font-mono text-emerald-400">{data.pullCount}</span>
					<span class="text-[10px] font-mono text-slate-400">{outdatedPRs.length} outdated</span>
				</div>
				<div class="bg-[#0d1117]/80 border border-white/10 rounded-xl p-3 flex flex-col gap-1">
					<span class="text-[10px] font-mono uppercase text-slate-400 tracking-wider">Open Issues</span>
					<span class="text-lg font-bold font-mono text-slate-300">{data.issueCount}</span>
					<span class="text-[10px] font-mono text-slate-400">tracked</span>
				</div>
				<div class="bg-[#0d1117]/80 border border-white/10 rounded-xl p-3 flex flex-col gap-1">
					<span class="text-[10px] font-mono uppercase text-slate-400 tracking-wider">Health Index</span>
					<span class="text-lg font-bold font-mono {latestStatus === 'success' ? 'text-emerald-400' : latestStatus === 'failure' ? 'text-red-400' : 'text-yellow-400'}">
						{latestStatus === 'success' ? '100%' : latestStatus === 'failure' ? 'CRITICAL' : 'SYNCING'}
					</span>
					<span class="text-[10px] font-mono text-slate-400">60s poll</span>
				</div>
			</div>

			<!-- Connected Organ Mesh -->
			<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-md flex flex-col gap-3">
				<div class="flex items-center justify-between text-xs font-mono text-slate-400 pb-2 border-b border-white/[0.06]">
					<span class="text-cyan-400 font-semibold uppercase">ORGAN MESH FEDERATION</span>
					<Layers size={14} class="text-cyan-400" />
				</div>
				<div class="grid grid-cols-2 gap-2 text-[11px] font-mono">
					{#each ALL_ORGANS as organ}
						<a
							href={`/repo/${organ.name}`}
							class={`p-2 rounded-lg border transition-all flex items-center justify-between ${
								organ.name === data.repo
									? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-semibold'
									: 'bg-[#161b22]/60 border-white/5 text-slate-300 hover:border-cyan-500/30 hover:text-cyan-400'
							}`}
						>
							<span class="truncate">{organ.name.replace('agent-', '')}</span>
							<span class="w-1.5 h-1.5 rounded-full {organ.name === data.repo ? 'bg-cyan-400' : 'bg-emerald-400'} shrink-0"></span>
						</a>
					{/each}
				</div>
			</div>

		</aside>

		<!-- CENTER PANEL: Interactive Pipeline DAG & Tab Content (Cols 4-8) -->
		<main class="lg:col-span-6 flex flex-col gap-6">

			<!-- Visual Stage Pipeline DAG -->
			<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-md flex flex-col gap-3">
				<div class="flex items-center justify-between text-xs font-mono text-slate-400 pb-2 border-b border-white/[0.06]">
					<div class="flex items-center gap-2">
						<span class="text-cyan-400 font-semibold uppercase">PIPELINE EXECUTION GRAPH</span>
						<span class="text-slate-500">//</span>
						<span class="text-slate-300">STAGE COMPOSE DAG</span>
					</div>
					<span class="text-[10px] text-emerald-400 font-mono">ACTIVE PIPELINE</span>
				</div>

				<!-- DAG Sequence Nodes -->
				<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
					<!-- Stage 1: Compile -->
					<div class="flex flex-col gap-1 p-2 rounded-lg bg-[#161b22]/70 border border-emerald-500/30">
						<div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
							<span>STAGE 01</span>
							<CheckCircle size={11} class="text-emerald-400" />
						</div>
						<span class="text-xs font-mono font-bold text-white">Compile</span>
						<span class="text-[10px] font-mono text-slate-400">rustc / tsc</span>
					</div>

					<!-- Stage 2: Unit Tests -->
					<div class="flex flex-col gap-1 p-2 rounded-lg bg-[#161b22]/70 border border-emerald-500/30">
						<div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
							<span>STAGE 02</span>
							<CheckCircle size={11} class="text-emerald-400" />
						</div>
						<span class="text-xs font-mono font-bold text-white">Unit Tests</span>
						<span class="text-[10px] font-mono text-slate-400">AAA suite</span>
					</div>

					<!-- Stage 3: Codesign -->
					<div class="flex flex-col gap-1 p-2 rounded-lg bg-[#161b22]/70 border border-emerald-500/30">
						<div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
							<span>STAGE 03</span>
							<CheckCircle size={11} class="text-emerald-400" />
						</div>
						<span class="text-xs font-mono font-bold text-white">Codesign</span>
						<span class="text-[10px] font-mono text-slate-400">Apple ID / Sign</span>
					</div>

					<!-- Stage 4: E2E Integration -->
					<div class="flex flex-col gap-1 p-2 rounded-lg bg-[#161b22]/70 border border-emerald-500/30">
						<div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
							<span>STAGE 04</span>
							<CheckCircle size={11} class="text-emerald-400" />
						</div>
						<span class="text-xs font-mono font-bold text-white">E2E Mesh</span>
						<span class="text-[10px] font-mono text-slate-400">Organ sync</span>
					</div>

					<!-- Stage 5: Release -->
					<div class="flex flex-col gap-1 p-2 rounded-lg bg-[#161b22]/70 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,242,254,0.15)]">
						<div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
							<span>STAGE 05</span>
							<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
						</div>
						<span class="text-xs font-mono font-bold text-cyan-300">Release</span>
						<span class="text-[10px] font-mono text-slate-400">Brew formula</span>
					</div>
				</div>
			</div>

			<!-- TAB CONTENT -->
			{#if activeTab === 'runs'}
				<!-- CI Runs Section -->
				<section class="flex flex-col gap-4">
					<div class="flex items-center justify-between">
						<h2 class="text-sm font-mono font-semibold tracking-wider text-slate-300 uppercase">
							Recent Workflow Runs ({commits.length})
						</h2>
						<button
							onclick={loadCommitsFromApi}
							disabled={loadingCommits}
							class="text-xs font-mono text-slate-400 hover:text-cyan-400 flex items-center gap-1.5 transition-colors disabled:opacity-50"
						>
							<RefreshCw size={12} class={loadingCommits ? 'animate-spin' : ''} />
							<span>Refresh</span>
						</button>
					</div>

					{#if commits && commits.length > 0}
						<div class="flex flex-col gap-3">
							{#each commits as commit}
								{@const StatusIcon = getStatusIcon(commit.status)}
								<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-sm hover:border-cyan-500/30 transition-all flex flex-col gap-3">
									<div class="flex items-start justify-between gap-3">
										<div class="flex items-start gap-3 min-w-0">
											<div class={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${getStatusColorClasses(commit.status)}`}>
												<StatusIcon size={16} />
											</div>
											<div class="flex flex-col min-w-0">
												<span class="text-sm font-mono font-medium text-white truncate" title={commit.message}>
													{commit.message}
												</span>
												<div class="flex items-center gap-2.5 text-[11px] font-mono text-slate-400 mt-1 flex-wrap">
													<span class="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
														{commit.sha.substring(0, 7)}
													</span>
													{#if commit.author}
														<span class="flex items-center gap-1.5 text-slate-300">
															<img src={commit.author.avatarUrl} alt="" class="w-3.5 h-3.5 rounded-full" />
															<span>{commit.author.login}</span>
														</span>
													{/if}
													<span class="flex items-center gap-1">
														<Clock size={11} />
														<span>{formatDate(commit.date)}</span>
													</span>
												</div>
											</div>
										</div>

										<div class="flex items-center gap-2 shrink-0">
											{#if commit.runs && commit.runs.length > 0 && commit.runs[0].id}
												<button
													onclick={() => viewLogs(String(commit.runs[0].id), commit.message, commit.status)}
													class="px-2.5 py-1 rounded bg-[#161b22] border border-white/10 hover:border-cyan-500/40 text-[11px] font-mono text-slate-300 hover:text-cyan-300 transition-colors flex items-center gap-1.5"
													title="Inspect Logs"
												>
													<TerminalIcon size={12} />
													<span class="hidden sm:inline">Logs</span>
												</button>
											{/if}
										</div>
									</div>

									<!-- Stage Runs breakdown -->
									{#if commit.runs && commit.runs.length > 0}
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/[0.04]">
											{#each commit.runs as run}
												{@const RunIcon = getStatusIcon(run.status)}
												<div class="flex items-center justify-between p-2 rounded bg-[#080b10] border border-white/5 text-[11px] font-mono">
													<div class="flex items-center gap-2 truncate">
														<RunIcon size={12} class={run.status === 'success' ? 'text-emerald-400' : run.status === 'failure' ? 'text-red-400' : 'text-yellow-400'} />
														<span class="text-slate-300 truncate">{run.name}</span>
													</div>
													{#if run.id}
														<button
															onclick={() => viewLogs(String(run.id), run.name, run.status)}
															class="text-slate-400 hover:text-cyan-400 text-[10px] transition-colors ml-2 shrink-0"
														>
															view
														</button>
													{/if}
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>

						<!-- Intersection Observer Target -->
						{#if commitsPageInfo.hasNextPage}
							<div bind:this={observerTarget} class="h-16 flex items-center justify-center">
								<Loader2 class="w-5 h-5 animate-spin text-cyan-400" />
							</div>
						{/if}
					{:else}
						<div class="bg-[#0d1117] border border-white/10 rounded-xl p-8 text-center text-slate-400 font-mono text-xs">
							No CI runs found for the default branch.
						</div>
					{/if}
				</section>
			{:else if activeTab === 'readme'}
				<!-- README Section -->
				<section class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-6 shadow-sm overflow-hidden">
					<article class="prose prose-invert max-w-none prose-headings:font-mono prose-a:text-cyan-400 text-xs sm:text-sm">
						{@html data.readmeHtml}
					</article>
				</section>
			{:else if activeTab === 'releases'}
				<!-- Releases Section -->
				<section class="flex flex-col gap-4">
					{#if releases && releases.length > 0}
						{#each releases as release}
							<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-5 shadow-sm flex flex-col gap-3">
								<div class="flex items-start justify-between gap-4">
									<div class="flex flex-col gap-1">
										<h3 class="text-base font-mono font-bold text-white">{release.name || release.tag}</h3>
										<div class="flex items-center gap-2 text-xs font-mono text-slate-400">
											<span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
												{release.tag}
											</span>
											<span>Published: {formatDate(release.publishedAt)}</span>
										</div>
									</div>
									<a
										href={release.url}
										target="_blank"
										rel="noopener noreferrer"
										class="px-2.5 py-1 rounded bg-[#161b22] border border-white/10 text-xs font-mono text-slate-300 hover:text-cyan-400 transition-colors flex items-center gap-1"
									>
										<span>Release Assets</span>
										<ExternalLink size={12} />
									</a>
								</div>
								{#if release.descriptionHTML}
									<div class="text-xs font-sans text-slate-300 prose prose-invert max-w-none pt-2 border-t border-white/[0.06]">
										{@html release.descriptionHTML}
									</div>
								{/if}
							</div>
						{/each}
					{:else}
						<div class="bg-[#0d1117] border border-white/10 rounded-xl p-8 text-center text-slate-400 font-mono text-xs">
							No published releases found.
						</div>
					{/if}
				</section>
			{:else if activeTab === 'issues'}
				<!-- Issues Section -->
				<section class="flex flex-col gap-4">
					{#if issues && issues.length > 0}
						{#each issues as issue}
							<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-sm flex flex-col gap-2">
								<div class="flex items-start justify-between gap-3">
									<div class="flex flex-col gap-1">
										<a
											href={issue.url}
											target="_blank"
											rel="noopener noreferrer"
											class="text-sm font-mono font-semibold text-white hover:text-cyan-400 transition-colors"
										>
											#{issue.number} {issue.title}
										</a>
										<span class="text-xs font-mono text-slate-400">
											opened by {issue.author?.login || 'unknown'} • {formatDate(issue.createdAt)}
										</span>
									</div>
									{#if data.session}
										<button
											onclick={() => closeIssue(issue.number)}
											disabled={closingIds.has(issue.number)}
											class="px-2.5 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs font-mono transition-all disabled:opacity-50"
										>
											{closingIds.has(issue.number) ? 'Closing...' : 'Close Issue'}
										</button>
									{/if}
								</div>
							</div>
						{/each}
					{:else}
						<div class="bg-[#0d1117] border border-white/10 rounded-xl p-8 text-center text-slate-400 font-mono text-xs">
							No open issues.
						</div>
					{/if}
				</section>
			{/if}

		</main>

		<!-- RIGHT PANEL: Pull Requests & Outdated Branch Manager (Cols 9-12) -->
		<aside class="lg:col-span-3 flex flex-col gap-4">

			<!-- PR Header & Batch Merge Toolbar -->
			<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-md flex flex-col gap-3">
				<div class="flex items-center justify-between pb-2 border-b border-white/[0.06]">
					<div class="flex items-center gap-2">
						<GitPullRequest size={15} class="text-cyan-400" />
						<span class="text-xs font-mono font-bold uppercase text-white">ACTIVE PR QUEUE</span>
						<span class="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold">
							{pulls.length}
						</span>
					</div>
					<button
						onclick={() => loadPulls()}
						disabled={loadingPulls}
						class="text-slate-400 hover:text-cyan-400 p-1"
						title="Refresh PRs"
					>
						<RefreshCw size={12} class={loadingPulls ? 'animate-spin' : ''} />
					</button>
				</div>

				<!-- Outdated Branch Warning Notice -->
				{#if outdatedPRs.length > 0}
					<div class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2">
						<div class="flex items-center gap-2 text-amber-400 text-xs font-mono font-semibold">
							<AlertCircle size={14} class="shrink-0" />
							<span>{outdatedPRs.length} branch{outdatedPRs.length > 1 ? 'es are' : ' is'} outdated</span>
						</div>
						<p class="text-[11px] font-sans text-amber-200/80">
							Direct squash-merges are strictly blocked by branch protection until rebased on latest {data.defaultBranch || 'master'}.
						</p>
					</div>
				{/if}

				<!-- Batch Merge Action Bar -->
				{#if data.session && pulls.length > 0}
					<div class="flex flex-col gap-2 pt-1 border-t border-white/[0.06]">
						<div class="flex items-center justify-between text-xs font-mono">
							<button
								type="button"
								onclick={selectAllReadyPRs}
								class="text-slate-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors"
							>
								{#if selectedPRs.size === readyPRs.length && readyPRs.length > 0}
									<CheckSquare size={13} class="text-cyan-400" />
								{:else}
									<Square size={13} />
								{/if}
								<span>Select Ready ({readyPRs.length})</span>
							</button>

							<span class="text-[11px] text-slate-500">
								{selectedPRs.size} selected
							</span>
						</div>

						<button
							type="button"
							onclick={batchMergeSelected}
							disabled={selectedPRs.size === 0 || batchMerging}
							class="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-[#080b10] text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(16,185,129,0.3)] hover:shadow-[0_0_18px_rgba(16,185,129,0.5)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
						>
							<GitMerge size={13} class={batchMerging ? 'animate-spin' : ''} />
							<span>{batchMerging ? 'Batch Merging...' : `Batch Merge (${selectedPRs.size})`}</span>
						</button>
					</div>
				{/if}
			</div>

			<!-- Pull Requests List -->
			{#if pulls && pulls.length > 0}
				<div class="flex flex-col gap-3">
					{#each pulls as pr}
						{@const isConflicting = pr.mergeable === 'CONFLICTING'}
						{@const isUnknown = pr.mergeable === 'UNKNOWN'}
						<div class="bg-[#0d1117]/80 backdrop-blur-md border border-white/10 rounded-xl p-3.5 shadow-sm hover:border-cyan-500/30 transition-all flex flex-col gap-3">
							
							<!-- Top Header with Checkbox & Title -->
							<div class="flex items-start gap-2.5">
								{#if data.session}
									<button
										type="button"
										onclick={() => toggleSelectPR(pr.number)}
										disabled={!pr.canMerge}
										class="mt-0.5 text-slate-400 hover:text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
										title={!pr.canMerge ? (pr.isBehind ? 'Branch outdated: click Update Branch' : pr.isDirty ? 'Merge conflicts' : 'Blocked by checks') : 'Select for batch merge'}
									>
										{#if selectedPRs.has(pr.number)}
											<CheckSquare size={15} class="text-cyan-400" />
										{:else}
											<Square size={15} />
										{/if}
									</button>
								{/if}

								<div class="flex flex-col min-w-0 flex-1">
									<a
										href={pr.url}
										target="_blank"
										rel="noopener noreferrer"
										class="text-xs font-mono font-semibold text-white hover:text-cyan-300 transition-colors line-clamp-2"
										title={pr.title}
									>
										#{pr.number}: {pr.title}
									</a>
									<div class="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-1 flex-wrap">
										<span>{pr.headRefName} → {pr.baseRefName}</span>
										{#if pr.author}
											<span class="text-slate-300">by @{pr.author.login}</span>
										{/if}
									</div>
								</div>
							</div>

							<!-- PR Outdated Warning & Update Branch CTA -->
							{#if pr.isBehind}
								<div class="p-2 rounded bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2 text-[11px] font-mono">
									<span class="text-amber-400 font-semibold">⚠️ Behind {data.defaultBranch || 'master'}</span>
									{#if data.session}
										<button
											onclick={() => updateBranch(pr.number)}
											disabled={updatingBranchIds.has(pr.number)}
											class="px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-all flex items-center gap-1 font-semibold disabled:opacity-50"
										>
											<RefreshCw size={11} class={updatingBranchIds.has(pr.number) ? 'animate-spin' : ''} />
											<span>Update Branch</span>
										</button>
									{/if}
								</div>
							{/if}

							<!-- Checks strip -->
							{#if pr.checks && pr.checks.length > 0}
								<div class="flex items-center gap-1.5 flex-wrap">
									{#each pr.checks as check}
										{@const CheckIcon = getStatusIcon(check.status)}
										<button
											onclick={() => check.id && viewLogs(check.id, check.name, check.status)}
											class="px-2 py-0.5 rounded bg-[#080b10] border border-white/10 text-[10px] font-mono text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30 transition-colors flex items-center gap-1"
											title={check.name}
										>
											<CheckIcon size={10} class={check.status === 'success' ? 'text-emerald-400' : check.status === 'failure' ? 'text-red-400' : 'text-yellow-400'} />
											<span class="max-w-[100px] truncate">{check.name}</span>
										</button>
									{/each}
								</div>
							{/if}

							<!-- Single PR Merge Button with strict outdated lock -->
							{#if data.session}
								<div class="pt-2 border-t border-white/[0.04] flex items-center justify-between gap-2">
									<span class="text-[10px] font-mono text-slate-400">
										{#if pr.isBehind}
											<span class="text-amber-400">Outdated</span>
										{:else if pr.isDirty}
											<span class="text-red-400">Conflicts</span>
										{:else if pr.canMerge}
											<span class="text-emerald-400">Ready to Merge</span>
										{:else}
											<span class="text-yellow-400">Checks Pending</span>
										{/if}
									</span>

									<button
										onclick={() => mergePR(pr.number)}
										disabled={mergingIds.has(pr.number) || pr.isBehind || pr.isDirty || !pr.canMerge}
										title={pr.isBehind ? 'Branch is outdated. Click "Update Branch" first.' : pr.isDirty ? 'Merge conflicts detected' : !pr.canMerge ? 'Blocked by branch protection or checks' : 'Squash & merge pull request'}
										class={`px-3 py-1 rounded text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
											pr.canMerge
												? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
												: 'bg-white/5 text-slate-500 border border-white/5 opacity-50 cursor-not-allowed'
										}`}
									>
										<GitMerge size={12} class={mergingIds.has(pr.number) ? 'animate-spin' : ''} />
										<span>{mergingIds.has(pr.number) ? 'Merging...' : pr.isBehind ? 'Branch Outdated' : pr.isDirty ? 'Conflicts' : 'Squash & Merge'}</span>
									</button>
								</div>
							{/if}

						</div>
					{/each}
				</div>
			{:else}
				<div class="bg-[#0d1117] border border-white/10 rounded-xl p-6 text-center text-slate-400 font-mono text-xs">
					No active pull requests. Master synchronized at v1.0.0-beta.1.
				</div>
			{/if}

		</aside>

	</div>

	<!-- BOTTOM DRAWER / Quick Installation Dock -->
	<footer class="bg-[#0d1117]/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 sm:p-5 shadow-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mt-4">
		<div class="flex items-center gap-3">
			<AutonomicLogo size={32} animated={false} />
			<div class="flex flex-col">
				<span class="text-xs font-mono font-bold text-white uppercase tracking-wider">
					HOMEBREW TAP QUICK INSTALLATION
				</span>
				<span class="text-[11px] font-mono text-slate-400">
					Darwin Apple Silicon Native arm64 • Developer ID Notarized
				</span>
			</div>
		</div>

		<!-- Command Prompt Box -->
		<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-2xl">
			<div class="flex-1 bg-[#080b10] border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
				<div class="flex items-center gap-2 text-xs font-mono text-slate-300 truncate select-all">
					<span class="text-cyan-400">&gt;_</span>
					<span class="truncate">brew tap autonomic-ai-dev/tap && brew install {data.repo}</span>
				</div>
				<button
					onclick={() => copyToClipboard(`brew tap autonomic-ai-dev/tap && brew install ${data.repo}`, 'brew')}
					class="text-slate-400 hover:text-cyan-400 p-1 shrink-0 transition-colors"
					title="Copy to Clipboard"
				>
					{#if copiedBrew}
						<Check size={14} class="text-emerald-400" />
					{:else}
						<Copy size={14} />
					{/if}
				</button>
			</div>

			<button
				onclick={() => copyToClipboard(`${data.repo} doctor --verbose`, 'doctor')}
				class="px-3.5 py-2 rounded-lg bg-[#161b22] border border-white/10 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-300 text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-all"
				title="Run Organ Diagnostics"
			>
				<Terminal size={13} />
				<span>{copiedDoctor ? 'Copied Doctor!' : 'Doctor Verify'}</span>
			</button>
		</div>
	</footer>

</div>

<!-- Fullscreen ANSI Terminal Logs Modal -->
{#if terminalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
		<div class="bg-[#080b10] border border-cyan-500/30 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
			<!-- Terminal Header -->
			<div class="bg-[#0d1117] border-b border-white/10 px-4 py-3 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<span class="w-3 h-3 rounded-full bg-red-500/80 inline-block"></span>
					<span class="w-3 h-3 rounded-full bg-yellow-500/80 inline-block"></span>
					<span class="w-3 h-3 rounded-full bg-green-500/80 inline-block"></span>
					<span class="text-slate-400 ml-2">CONSOLE // {terminalTitle} (Run #{terminalRunId})</span>
				</div>
				<button
					onclick={() => (terminalOpen = false)}
					class="text-slate-400 hover:text-white transition-colors p-1"
				>
					<X size={16} />
				</button>
			</div>

			<!-- Terminal Output -->
			<div class="p-4 overflow-y-auto flex-1 bg-[#080b10] text-slate-300 font-mono text-xs leading-relaxed select-text min-h-[350px]">
				{#if terminalLoading}
					<div class="flex items-center justify-center h-48 gap-2 text-cyan-400">
						<Loader2 class="animate-spin" size={18} />
						<span>Fetching streaming logs from GitHub...</span>
					</div>
				{:else}
					<pre class="whitespace-pre-wrap font-mono text-[11px] text-cyan-300/90">{terminalLogs}</pre>
				{/if}
			</div>

			<!-- Terminal Footer -->
			<div class="bg-[#0d1117] border-t border-white/10 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-400">
				<span>Status: <span class="text-emerald-400 font-bold uppercase">{terminalRunStatus}</span></span>
				<button
					onclick={() => copyToClipboard(terminalLogs, 'brew')}
					class="hover:text-cyan-300 flex items-center gap-1 transition-colors"
				>
					<Copy size={12} />
					<span>Copy Console Output</span>
				</button>
			</div>
		</div>
	</div>
{/if}
