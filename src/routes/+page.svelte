<script lang="ts">
	import {
		Activity,
		Clock,
		CheckCircle,
		XCircle,
		AlertCircle,
		RefreshCw,
		Search
	} from '@lucide/svelte';
	import { onMount } from 'svelte';

	let { data } = $props();

	// Local state for polling and filtering
	let initialStatuses = data.statuses;
	let statuses = $state(initialStatuses);
	let lastUpdated = $state(new Date());
	let searchQuery = $state('');
	let activeFilter = $state('all'); // all, failure, pending, success

	$effect(() => {
		statuses = data.statuses;
		lastUpdated = new Date();
	});

	// Poll API every 60s
	onMount(() => {
		const interval = setInterval(async () => {
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
		}, 60000);
		return () => clearInterval(interval);
	});

	function getStatusIcon(status: string) {
		switch (status) {
			case 'success':
				return CheckCircle;
			case 'failure':
				return XCircle;
			case 'cancelled':
				return AlertCircle;
			case 'pending':
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

	// Derived state
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

								// Import public key dynamically
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
							const res = await fetch(`/api/status?t=${Date.now()}`, { cache: 'no-store' });
							const json = await res.json();
							if (json.success) {
								statuses = json.data;
								lastUpdated = new Date();
							}
						} catch (e) {
							console.error('Failed to poll status', e);
						}
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
</div>

<style>
	.hide-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.hide-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
