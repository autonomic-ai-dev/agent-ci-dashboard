<script lang="ts">
	import '../app.css';
	import { LogOut, Activity } from '@lucide/svelte';
	import { signIn, signOut } from '@auth/sveltekit/client';
	import AutonomicLogo from '$lib/components/AutonomicLogo.svelte';

	let { children, data } = $props();
</script>

<div
	class="min-h-screen text-slate-100 bg-[#080b10] antialiased selection:bg-cyan-500/20 selection:text-cyan-300 relative flex flex-col font-sans"
>
	<!-- Mission Control Ambient Telemetry Grid Background -->
	<div class="fixed inset-0 z-0 pointer-events-none opacity-40">
		<div
			class="absolute top-0 left-1/4 w-[40rem] h-[40rem] bg-cyan-500/10 rounded-full filter blur-[140px] animate-pulse"
		></div>
		<div
			class="absolute top-1/3 right-1/4 w-[35rem] h-[35rem] bg-emerald-500/10 rounded-full filter blur-[140px] animate-pulse"
			style="animation-delay: 2s"
		></div>
		<div
			class="absolute bottom-10 left-1/3 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full filter blur-[140px] animate-pulse"
			style="animation-delay: 4s"
		></div>
		<!-- Subtle Coordinate Micro-Grid -->
		<div
			class="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]"
		></div>
	</div>

	{#if data.session}
		<!-- Top bar with user info & avionics telemetry strip -->
		<header
			class="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 py-2.5 bg-[#0d1117]/90 backdrop-blur-xl border-b border-white/[0.08]"
		>
			<a
				href="/"
				class="flex items-center gap-3 text-slate-300 hover:text-cyan-400 transition-all group"
			>
				<AutonomicLogo size={28} animated={true} />
				<div class="flex items-baseline gap-2">
					<span class="text-sm font-bold tracking-widest uppercase font-mono text-cyan-400">Autonomic</span>
					<span class="text-xs font-mono text-slate-400 tracking-wider hidden sm:inline">Mission Control</span>
				</div>
			</a>

			<!-- Center Avionics Telemetry Indicator -->
			<div class="hidden md:flex items-center gap-3 px-3.5 py-1 rounded-full bg-[#161b22] border border-white/10 text-[11px] font-mono">
				<span class="relative flex h-2 w-2">
					<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
					<span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
				</span>
				<span class="text-emerald-400 font-semibold tracking-wide">11/11 ORGANS ACTIVE</span>
				<span class="text-white/20">|</span>
				<span class="text-slate-300">DARWIN-ARM64</span>
				<span class="text-white/20">|</span>
				<span class="text-cyan-400">{data.ecosystemVersion || '—'}</span>
			</div>

			<div
				class="flex items-center gap-2 px-3 py-1 bg-[#161b22] border border-white/10 rounded-full shadow-sm"
			>
				{#if data.session.user?.image}
					<img src={data.session.user.image} alt="User" class="w-6 h-6 rounded-full shrink-0 border border-cyan-400/30" />
				{/if}
				<span class="text-xs font-medium font-mono text-slate-200 truncate max-w-[120px] sm:max-w-[180px]"
					>{data.session.user?.name || data.session.user?.email}</span
				>
				<div class="w-px h-3.5 bg-white/10 mx-1"></div>
				<button
					type="button"
					onclick={() => signOut({ callbackUrl: '/' })}
					class="text-slate-400 hover:text-red-400 transition-colors p-1"
					title="Sign Out"
				>
					<LogOut size={13} />
				</button>
			</div>
		</header>

		<main class="w-full relative z-10 flex-1">
			{@render children()}
		</main>
	{:else}
		<div
			class="flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden z-10"
		>
			<div
				class="bg-[#0d1117]/95 border border-white/10 rounded-2xl p-8 sm:p-10 max-w-md w-full shadow-2xl relative z-10 flex flex-col items-center text-center backdrop-blur-xl"
			>
				<AutonomicLogo size={64} animated={true} class="mb-6" />

				<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-4">
					<span class="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping"></span>
					AUTONOMIC ECOSYSTEM
				</div>

				<h1 class="text-2xl font-bold font-mono tracking-tight text-white mb-2">Mission Control</h1>
				<p class="text-slate-400 text-sm mb-8 font-sans">
					Sign in with GitHub to access the real-time telemetry mesh, inspect Apple Silicon arm64 builds, and manage release workflows.
				</p>

				<button
					type="button"
					onclick={() => signIn('github', { callbackUrl: '/' })}
					class="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-[#080b10] px-6 py-3 rounded-xl font-mono text-sm font-semibold transition-all shadow-lg hover:shadow-cyan-500/20"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="currentColor"
					><path
						d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
					/></svg>
					<span>Sign in with GitHub</span>
				</button>
			</div>
		</div>
	{/if}
</div>
