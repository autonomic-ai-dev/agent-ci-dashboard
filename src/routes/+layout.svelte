<script lang="ts">
	import '../app.css';
	import { LogOut, Activity } from '@lucide/svelte';
	import { signIn, signOut } from '@auth/sveltekit/client';

	let { children, data } = $props();
</script>

<div
	class="min-h-screen text-text-primary-light dark:text-text-primary-dark transition-colors duration-300"
>
	<!-- Global Background effects for Glassmorphism -->
	<div class="fixed inset-0 z-0 pointer-events-none">
		<div
			class="absolute top-1/4 left-1/4 w-[30rem] h-[30rem] bg-cyan-500/30 dark:bg-cyan-500/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[120px] opacity-70 animate-pulse"
		></div>
		<div
			class="absolute top-1/3 right-1/4 w-[30rem] h-[30rem] bg-orange-500/30 dark:bg-orange-500/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[120px] opacity-70 animate-pulse"
			style="animation-delay: 2s"
		></div>
		<div
			class="absolute bottom-1/4 left-1/3 w-[30rem] h-[30rem] bg-pink-500/30 dark:bg-pink-500/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[120px] opacity-70 animate-pulse"
			style="animation-delay: 4s"
		></div>
	</div>

	{#if data.session}
		<!-- Top bar with user info -->
		<header
			class="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 py-2 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur-lg border-b border-border-light dark:border-border-dark"
		>
			<a
				href="/"
				class="flex items-center gap-2 text-text-secondary-light dark:text-text-secondary-dark hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
			>
				<div
					class="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-orange-600 flex items-center justify-center shadow-sm"
				>
					<Activity class="text-white" size={16} />
				</div>
				<span class="text-sm font-semibold tracking-tight hidden sm:inline">Agent CI</span>
			</a>

			<div
				class="flex items-center gap-2 px-3 py-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-full shadow-sm"
			>
				<img src={data.session.user?.image} alt="User" class="w-6 h-6 rounded-full shrink-0" />
				<span class="text-sm font-medium truncate max-w-[120px] sm:max-w-[200px]"
					>{data.session.user?.name || data.session.user?.email}</span
				>
				<div class="w-px h-4 bg-border-light dark:bg-border-dark mx-1"></div>
				<button
					type="button"
					onclick={() => signOut({ callbackUrl: '/' })}
					class="text-text-secondary-light hover:text-red-500 dark:text-text-secondary-dark transition-colors p-1"
					title="Sign Out"
				>
					<LogOut size={14} />
				</button>
			</div>
		</header>

		<main class="w-full relative z-10">
			{@render children()}
		</main>
	{:else}
		<div
			class="flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden z-10"
		>
			<div
				class="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-3xl p-10 max-w-md w-full shadow-2xl relative z-10 flex flex-col items-center text-center"
			>
				<div
					class="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-orange-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 mb-6"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="white"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg
					>
				</div>

				<h1 class="text-3xl font-bold mb-3 tracking-tight">Agent CI</h1>
				<p class="text-text-secondary-light dark:text-text-secondary-dark mb-8">
					Sign in with your GitHub account to access the mission control dashboard and trigger
					actions.
				</p>

				<button
					type="button"
					onclick={() => signIn('github', { callbackUrl: '/' })}
					class="w-full flex items-center justify-center gap-3 bg-[#24292F] hover:bg-[#1F2328] dark:bg-white dark:hover:bg-gray-100 text-white dark:text-black px-6 py-3.5 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="currentColor"
						><path
							d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
						/></svg
					>
					<span>Sign in with GitHub</span>
				</button>
			</div>
		</div>
	{/if}
</div>
