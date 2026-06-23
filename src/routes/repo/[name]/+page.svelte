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
		User
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import mermaid from 'mermaid';
	import { getInsightsClient } from '$lib/grpc';

	let { data } = $props();

	let client: any;
	$effect(() => {
		const token = (data.session as { accessToken?: string } | null)?.accessToken;
		if (token) {
			client = getInsightsClient(token);
		}
	});

	type Tab = 'readme' | 'releases' | 'runs' | 'pulls' | 'issues';
	let activeTab = $derived.by<Tab>(() => {
		const tabParam = $page.url.searchParams.get('tab') as Tab | null;
		if (tabParam && ['readme', 'releases', 'runs', 'pulls', 'issues'].includes(tabParam)) return tabParam;
		return 'readme';
	});

	function switchTab(tab: Tab) {
		const url = new URL($page.url);
		if (tab === 'readme') url.searchParams.delete('tab');
		else url.searchParams.set('tab', tab);
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

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

	// Issue State
	let issues = $state<any[]>([]);
	let issuesPageInfo = $state<any>({ hasNextPage: false, endCursor: null });
	let loadingIssues = $state(false);

	// Terminal Logs State
	let terminalOpen = $state(false);
	let terminalLogs = $state('');
	let terminalTitle = $state('');
	let terminalRunId = $state('');
	let terminalRunStatus = $state('');
	let terminalLoading = $state(false);

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

	let rerunningIds = $state<Record<string, boolean>>({});
	let mergingPullNumber = $state<number | null>(null);
	let closingIssueNumber = $state<number | null>(null);

	$effect(() => {
		releases = data.releases || [];
		releasesPageInfo = data.releasesPageInfo || { hasNextPage: false, endCursor: null };
		commits = data.commits || [];
		commitsPageInfo = data.commitsPageInfo || { hasNextPage: false, endCursor: null };
	});

	let pullsLoaded = $state(false);
	let issuesLoaded = $state(false);

	$effect(() => {
		if (activeTab === 'pulls' && !pullsLoaded && (data.pullCount ?? 0) > 0) {
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
			if (!client) return;
			const stream = client.getWorkflowLogs({ runId: Number(runId) });
			let logs = '';
			for await (const chunk of stream) {
				logs += new TextDecoder().decode(chunk.data);
			}
			terminalLogs = logs || 'No logs available.';
		} catch (e) {
			terminalLogs = 'Failed to fetch logs.';
		} finally {
			terminalLoading = false;
		}
	}

	async function rerunWorkflow(runId: string, type: 'all' | 'failed' = 'failed') {
		rerunningIds = { ...rerunningIds, [runId]: true };

		try {
			const res = await client.rerunWorkflow({ repo: data.repo, runId: Number(runId), failedOnly: type === 'failed' });

			if (res.triggered) {
				addToast('Rerun triggered', 'success');
				if (activeTab === 'pulls') {
					pulls = [];
					pullsLoaded = false;
					loadPulls();
				} else {
					commits = [];
					loadingCommits = false;
					loadCommitsFromApi();
				}
				if (terminalOpen) terminalOpen = false;
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

	async function loadCommitsFromApi() {
		if (!client) return;
		loadingCommits = true;
		try {
			const res = await client.getWorkflowHistory({ repo: data.repo, first: 20 });
			commits = res.runs as any;
			commitsPageInfo = res.pageInfo as any;
		} catch (e) {
			console.error('Failed to reload commits', e);
		} finally {
			loadingCommits = false;
		}
	}

	async function loadPulls(after?: string) {
		if (loadingPulls || !client) return;
		loadingPulls = true;
		try {
			const res = await client.getRepoPulls({ repo: data.repo, first: 20, after: after || '' });
			pulls = after ? [...pulls, ...(res.pullRequests as any)] : (res.pullRequests as any);
			pullsPageInfo = res.pageInfo as any;
		} catch (e) {
			console.error('Failed to fetch PRs', e);
		} finally {
			loadingPulls = false;
		}
	}

	async function loadIssues(after?: string) {
		if (loadingIssues || !client) return;
		loadingIssues = true;
		try {
			const res = await client.getRepoIssues({ repo: data.repo, first: 20, after: after || '' });
			issues = after ? [...issues, ...(res.issues as any)] : (res.issues as any);
			issuesPageInfo = res.pageInfo as any;
		} catch (e) {
			console.error('Failed to fetch issues', e);
		} finally {
			loadingIssues = false;
		}
	}

	async function mergePR(pullNumber: number) {
		showConfirm('Merge this pull request?', async () => {
			mergingPullNumber = pullNumber;

			try {
				const res = await client.mergePullRequest({ repo: data.repo, pullNumber });

				if (res.merged) {
					pulls = pulls.filter((pr) => pr.number !== pullNumber);
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

	async function closeIssue(issueNumber: number) {
		showConfirm('Close this issue?', async () => {
			closingIssueNumber = issueNumber;

			try {
				const res = await client.closeIssue({ repo: data.repo, issueNumber });

				if (res.closed) {
					issues = issues.filter((issue) => issue.number !== issueNumber);
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

	// Load more function
	async function loadMore() {
		if (activeTab === 'releases' && releasesPageInfo.hasNextPage && !loadingReleases) {
			loadingReleases = true;
			try {
				const res = await client.getReleases({ repo: data.repo, first: 20, after: releasesPageInfo.endCursor });
				releases = [...releases, ...(res.releases as any)];
				releasesPageInfo = res.pageInfo as any;
			} catch (e) {
				console.error('Failed to load more releases', e);
			} finally {
				loadingReleases = false;
			}
		} else if (activeTab === 'runs' && commitsPageInfo.hasNextPage && !loadingCommits) {
			loadingCommits = true;
			try {
				const res = await client.getWorkflowHistory({ repo: data.repo, first: 20, after: commitsPageInfo.endCursor });
				commits = [...commits, ...(res.runs as any)];
				commitsPageInfo = res.pageInfo as any;
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
			primaryColor: '#06b6d4',
			primaryTextColor: '#e2e8f0',
			primaryBorderColor: '#0891b2',
			lineColor: '#334155',
			secondaryColor: '#0f172a',
			tertiaryColor: '#1e293b'
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
</script>

<svelte:head>
	<title>{data.repo} — Agent CI Dashboard</title>
	<meta
		name="description"
		content="CI/CD pipeline status, release history, and build logs for {data.repo} in the Autonomic AI agent ecosystem."
	/>
</svelte:head>

<div class="max-w-[1000px] mx-auto px-6 py-12 flex flex-col min-h-[calc(100vh-4rem)] relative z-10">
	<!-- Header Navigation -->
	<nav class="mb-10 flex items-center justify-between">
		<a
			href="/"
			class="flex items-center gap-2 text-text-secondary-light dark:text-text-secondary-dark hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors font-medium"
		>
			<ArrowLeft size={20} />
			<span>Back to Dashboard</span>
		</a>
		<a
			href={data.repoUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-primary-light dark:text-text-primary-dark hover:border-cyan-500/50 hover:shadow-lg transition-all font-medium text-sm"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
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
			<span>View on GitHub</span>
		</a>
	</nav>

	<!-- Page Title -->
	<header class="mb-8">
		<div class="flex items-center justify-between gap-4 mb-3">
			<h1
				class="text-4xl font-bold text-text-primary-light dark:text-text-primary-dark tracking-tight"
			>
				{data.repo}
			</h1>
			{#if commits && commits.length > 0}
				{@const latestStatus = commits[0].status}
				{@const StatusIcon = getStatusIcon(latestStatus)}
				<div
					class={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase border bg-surface-light dark:bg-surface-dark ${getStatusColorClasses(latestStatus)}`}
				>
					<span class="relative flex h-2 w-2 mr-1">
						{#if latestStatus === 'pending'}
							<span
								class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"
							></span>
							<span
								class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"
								style="box-shadow: 0 0 8px currentColor"
							></span>
						{:else if latestStatus === 'success'}
							<span
								class="relative inline-flex rounded-full h-2 w-2 bg-green-500"
								style="box-shadow: 0 0 8px currentColor"
							></span>
						{:else if latestStatus === 'failure'}
							<span
								class="relative inline-flex rounded-full h-2 w-2 bg-red-500"
								style="box-shadow: 0 0 8px currentColor"
							></span>
						{:else if latestStatus === 'cancelled'}
							<span
								class="relative inline-flex rounded-full h-2 w-2 bg-gray-500"
								style="box-shadow: 0 0 8px currentColor"
							></span>
						{:else}
							<span
								class="relative inline-flex rounded-full h-2 w-2 bg-gray-500"
								style="box-shadow: 0 0 8px currentColor"
							></span>
						{/if}
					</span>
					{latestStatus}
				</div>
			{/if}
		</div>
		<p class="text-text-secondary-light dark:text-text-secondary-dark">
			Repository Details & Status History
		</p>
	</header>

	<!-- Tabs -->
	<div
		class="flex gap-2 mb-8 border-b border-border-light dark:border-border-dark overflow-x-auto pb-1"
	>
		<button
			onclick={() => switchTab('readme')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'readme' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400 bg-black/5 dark:bg-white/5' : 'text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark hover:bg-black/5 dark:hover:bg-white/5'}`}
		>
			<FileText size={18} />
			<span>README.md</span>
		</button>
		<button
			onclick={() => switchTab('releases')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'releases' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400 bg-black/5 dark:bg-white/5' : 'text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark hover:bg-black/5 dark:hover:bg-white/5'}`}
		>
			<Tag size={18} />
			<span>Release History</span>
		</button>
		<button
			onclick={() => switchTab('runs')}
			class={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap ${activeTab === 'runs' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400 bg-black/5 dark:bg-white/5' : 'text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark hover:bg-black/5 dark:hover:bg-white/5'}`}
		>
			<Activity size={18} />
			<span>CI History</span>
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
	<div class="flex flex-col gap-12">
		{#if activeTab === 'readme'}
			<!-- README Section -->
			<section
				class="glass-card rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500"
			>
				<div class="p-6 md:p-8 overflow-x-auto">
					<article
						class="prose prose-slate dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-cyan-600 dark:prose-a:text-cyan-400"
					>
						{@html data.readmeHtml}
					</article>
				</div>
			</section>
		{:else if activeTab === 'releases'}
			<!-- Release Notes History Section -->
			<section class="animate-in fade-in slide-in-from-bottom-4 duration-500">
				{#if releases && releases.length > 0}
					<div class="flex flex-col gap-6">
						{#each releases as release}
							<a
								href={release.url}
								target="_blank"
								rel="noopener noreferrer"
								class="group block glass-card rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all hover:shadow-cyan-500/10"
							>
								<div
									class="bg-black/5 dark:bg-white/5 border-b border-border-light dark:border-border-dark px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
								>
									<div class="flex flex-col gap-1">
										<h3
											class="text-lg font-bold text-text-primary-light dark:text-text-primary-dark group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors"
										>
											{release.name}
										</h3>
										<div
											class="flex items-center gap-2 text-sm text-text-secondary-light dark:text-text-secondary-dark"
										>
											<span
												class="font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded border border-border-light dark:border-border-dark group-hover:border-cyan-500/30 transition-colors"
												>{release.tag}</span
											>
											<span class="flex items-center gap-1"
												><Clock size={14} /> {formatDate(release.publishedAt)}</span
											>
										</div>
									</div>

									{#if release.author}
										<div
											class="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-light dark:border-border-dark bg-white/50 dark:bg-black/20"
										>
											<img
												src={release.author.avatarUrl}
												alt={release.author.login}
												class="w-5 h-5 rounded-full"
											/>
											<span
												class="text-sm font-medium text-text-primary-light dark:text-text-primary-dark"
												>{release.author.login}</span
											>
										</div>
									{/if}
								</div>

								<div class="p-6 overflow-x-auto pointer-events-none">
									<article
										class="prose prose-slate dark:prose-invert max-w-none prose-sm prose-headings:font-semibold prose-a:text-cyan-600 dark:prose-a:text-cyan-400 prose-pre:bg-base-light dark:prose-pre:bg-base-dark prose-pre:border prose-pre:border-border-light dark:prose-pre:border-border-dark"
									>
										{@html release.descriptionHtml}
									</article>
								</div>
							</a>
						{/each}
					</div>

					<!-- Intersection Observer Target -->
					{#if releasesPageInfo.hasNextPage}
						<div bind:this={observerTarget} class="h-20 flex items-center justify-center mt-6">
							<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
						</div>
					{/if}
				{:else}
					<div
						class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-8 text-center text-text-secondary-light dark:text-text-secondary-dark"
					>
						<p>No formal releases found for this repository.</p>
					</div>
				{/if}
			</section>
		{:else if activeTab === 'runs'}
			<!-- CI Runs History Section -->
			<section class="animate-in fade-in slide-in-from-bottom-4 duration-500">
				{#if commits && commits.length > 0}
					<div class="flex flex-col gap-4">
						{#each commits as commit}
							{@const StatusIcon = getStatusIcon(commit.status)}
							<div
								class="glass-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4"
							>
								<!-- Commit Header -->
								<div class="flex justify-between items-start">
									<div class="flex flex-col gap-1.5">
										<h3
											class="text-[15px] font-medium text-text-primary-light dark:text-text-primary-dark max-w-2xl truncate"
											title={commit.message}
										>
											{commit.message}
										</h3>
										<div
											class="flex items-center gap-3 text-[13px] text-text-secondary-light dark:text-text-secondary-dark"
										>
											{#if commit.author}
												<a
													href={`https://github.com/${commit.author.login}`}
													target="_blank"
													rel="noopener noreferrer"
													class="flex items-center gap-1.5 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
												>
													<img
														src={commit.author.avatarUrl}
														alt={commit.author.login}
														class="w-4 h-4 rounded-full"
													/>
													<span>{commit.author.login}</span>
												</a>
											{/if}
											<div class="flex items-center gap-1.5">
												<a
													href={`${data.repoUrl}/commit/${commit.sha}`}
													target="_blank"
													rel="noopener noreferrer"
													class="font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded border border-border-light dark:border-border-dark text-[11px] hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
												>
													{commit.sha.substring(0, 7)}
												</a>
											</div>
											<div class="flex items-center gap-1">
												<Clock size={13} />
												<span>{formatDate(commit.date)}</span>
											</div>
										</div>
									</div>

									<div
										class={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase border ${getStatusColorClasses(commit.status)}`}
									>
										<StatusIcon size={14} />
										<span>{commit.status}</span>
									</div>
								</div>

								<!-- Workflows -->
								{#if commit.runs && commit.runs.length > 0}
									<div
										class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-border-light/50 dark:border-border-dark/50"
									>
										{#each commit.runs as run}
											{@const WfIcon = getStatusIcon(run.status)}
											<div
												class="group flex items-center justify-between text-[13px] bg-black/5 dark:bg-white/5 border border-border-light/50 dark:border-border-dark/50 px-3 py-2 rounded-lg hover:border-cyan-500/30 transition-colors"
											>
												<button
													disabled={run.status === 'queued' ||
														run.status === 'in_progress' ||
														run.status === 'pending'}
													onclick={(e) => {
														e.preventDefault();
														if (run.id) viewLogs(run.id, run.name, run.status);
													}}
													class="flex items-center gap-2 flex-1 min-w-0 text-left focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed group/btn"
													title={run.status === 'queued' ||
													run.status === 'in_progress' ||
													run.status === 'pending'
														? 'Logs will be available when the run completes'
														: run.name}
												>
													<WfIcon
														size={14}
														class={run.status === 'success'
															? 'text-green-500 dark:text-green-400'
															: run.status === 'failure' || run.status === 'timed_out'
																? 'text-red-500 dark:text-red-400'
																: run.status === 'cancelled'
																	? 'text-gray-500 dark:text-gray-400'
																	: 'text-yellow-500 dark:text-yellow-400'}
													/>
													<span
														class="text-text-primary-light dark:text-text-primary-dark truncate transition-colors group-[&:not(:disabled)]/btn:group-hover:text-cyan-600 group-[&:not(:disabled)]/btn:dark:group-hover:text-cyan-400"
														>{run.name}</span
													>
												</button>

												<a
													href={run.url || '#'}
													target={run.url ? '_blank' : undefined}
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

												{#if data.session && (run.status === 'failure' || run.status === 'timed_out' || run.status === 'cancelled') && run.id}
													<button
														onclick={(e) => {
															e.preventDefault();
															rerunWorkflow(run.id, 'failed');
														}}
														disabled={rerunningIds[String(run.id)]}
														class="opacity-0 group-hover:opacity-100 p-1.5 text-text-secondary-light hover:text-cyan-600 dark:text-text-secondary-dark dark:hover:text-cyan-400 bg-white dark:bg-black rounded border border-border-light dark:border-border-dark shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
														title="Rerun failed jobs"
													>
														<RefreshCw size={12} class={rerunningIds[String(run.id)] ? 'animate-spin' : ''} />
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
						<div bind:this={observerTarget} class="h-20 flex items-center justify-center mt-6">
							<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
						</div>
					{/if}
				{:else}
					<div
						class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-8 text-center text-text-secondary-light dark:text-text-secondary-dark"
					>
						<p>No CI runs found for the default branch.</p>
					</div>
				{/if}
			</section>
		{:else if activeTab === 'pulls'}
			<!-- Pull Requests Section -->
			<section class="animate-in fade-in slide-in-from-bottom-4 duration-500">
				{#if pulls && pulls.length > 0}
					<div class="flex flex-col gap-4">
						{#each pulls as pr}
							{@const PrStatusIcon = getStatusIcon(pr.status)}
							{@const isConflicting = pr.mergeable === 'CONFLICTING'}
							{@const isUnknown = pr.mergeable === 'UNKNOWN'}
							<div
								class="glass-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4"
							>
								<!-- PR Header -->
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
										<span class="font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded border border-border-light dark:border-border-dark"
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
											<span class="text-xs font-mono text-text-secondary-light dark:text-text-secondary-dark"
												>{pr.headRefName} → {pr.baseRefName}</span
											>
										</div>
										<!-- Labels -->
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
										<!-- Mergeable State -->
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
										<!-- Merge Button -->
										{#if data.session}
											<button
												onclick={(e) => {
													e.preventDefault();
													mergePR(pr.number);
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

								<!-- Assignees -->
								{#if pr.assignees && pr.assignees.length > 0}
									<div class="flex items-center gap-1.5">
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

								<!-- Checks -->
								{#if pr.checks && pr.checks.length > 0}
									<div
										class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-border-light/50 dark:border-border-dark/50"
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
														if (check.id) viewLogs(check.id, check.name, check.status);
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
															rerunWorkflow(check.id, 'failed');
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

					{#if pullsPageInfo.hasNextPage}
						<div bind:this={observerTarget} class="h-20 flex items-center justify-center mt-6">
							<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
						</div>
					{/if}
				{:else if !loadingPulls}
					<div
						class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-8 text-center text-text-secondary-light dark:text-text-secondary-dark"
					>
						<p>No open pull requests.</p>
					</div>
				{:else}
					<div class="h-20 flex items-center justify-center mt-6">
						<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
					</div>
				{/if}
			</section>
		{:else if activeTab === 'issues'}
			<!-- Issues Section -->
			<section class="animate-in fade-in slide-in-from-bottom-4 duration-500">
				{#if issues && issues.length > 0}
					<div class="flex flex-col gap-4">
						{#each issues as issue}
							<div
								class="glass-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4"
							>
								<!-- Issue Header -->
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
											<span class="font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded border border-border-light dark:border-border-dark"
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
										<!-- Labels -->
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

									<!-- Close Button -->
									{#if data.session}
										<button
											onclick={(e) => {
												e.preventDefault();
												closeIssue(issue.number);
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

								<!-- Assignees -->
								{#if issue.assignees && issue.assignees.length > 0}
									<div class="flex items-center gap-1.5">
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

					{#if issuesPageInfo.hasNextPage}
						<div bind:this={observerTarget} class="h-20 flex items-center justify-center mt-6">
							<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
						</div>
					{/if}
				{:else if !loadingIssues}
					<div
						class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-8 text-center text-text-secondary-light dark:text-text-secondary-dark"
					>
						<p>No open issues.</p>
					</div>
				{:else}
					<div class="h-20 flex items-center justify-center mt-6">
						<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
					</div>
				{/if}
			</section>
		{/if}
	</div>
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
								rerunWorkflow(terminalRunId, 'failed');
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

	:global(.inline-code::before),
	:global(.inline-code::after) {
		content: none !important;
	}

	:global(.prose :where(code):not(:where([class~='not-prose'] *))::before),
	:global(.prose :where(code):not(:where([class~='not-prose'] *))::after) {
		content: none !important;
	}

	:global(.language-mermaid) {
		background: transparent !important;
		padding: 0 !important;
	}

	:global(.code-block) {
		margin: 1.25em 0;
		border: 1px solid #334155;
		border-radius: 0.75rem;
		overflow: hidden;
		background: #0b1120;
	}

	:global(.code-block-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.75rem;
		background: #1e293b;
		border-bottom: 1px solid #334155;
		font-size: 0.75rem;
	}

	:global(.code-lang-label) {
		color: #94a3b8;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.copy-btn) {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid #475569;
		border-radius: 0.375rem;
		background: #334155;
		color: #94a3b8;
		font-size: 0.6875rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	:global(.copy-btn:hover) {
		background: #475569;
		color: #e2e8f0;
		border-color: #64748b;
	}

	:global(.code-block pre) {
		margin: 0 !important;
		border: none !important;
		border-radius: 0 !important;
		background: transparent !important;
		padding: 1rem !important;
		font-size: 0.8125rem !important;
		line-height: 1.5 !important;
	}

	:global(.code-block pre code) {
		background: transparent !important;
		padding: 0 !important;
		font-size: inherit !important;
	}

	:global(.dark .code-block) {
		background: #0b1120;
		border-color: #1e293b;
	}
</style>
