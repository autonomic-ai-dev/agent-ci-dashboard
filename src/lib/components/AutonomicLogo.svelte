<script lang="ts">
	interface Props {
		size?: number;
		animated?: boolean;
		class?: string;
	}

	let { size = 32, animated = false, class: className = '' }: Props = $props();
</script>

<div
	class="relative flex items-center justify-center shrink-0 {className}"
	style="width: {size}px; height: {size}px;"
>
	<svg
		viewBox="0 0 512 512"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		class="w-full h-full {animated ? 'hover:scale-105 transition-transform duration-300' : ''}"
	>
		<defs>
			<radialGradient id="logoBgGrad" cx="50%" cy="50%" r="60%">
				<stop offset="0%" stop-color="#0f172a" />
				<stop offset="100%" stop-color="#050811" />
			</radialGradient>
			<linearGradient id="logoCyanEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color="#00f2fe" />
				<stop offset="50%" stop-color="#00d2ff" />
				<stop offset="100%" stop-color="#10b981" />
			</linearGradient>
			<filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
				<feGaussianBlur stdDeviation="8" result="blur" />
				<feComposite in="SourceGraphic" in2="blur" operator="over" />
			</filter>
		</defs>

		<!-- Base Container Plate -->
		<rect width="512" height="512" rx="112" fill="url(#logoBgGrad)" />
		<rect width="512" height="512" rx="112" stroke="rgba(255, 255, 255, 0.1)" stroke-width="3" />

		<!-- Outer Hexagonal Telemetry Track -->
		<polygon
			points="256,54 420,148 420,338 256,432 92,338 92,148"
			fill="none"
			stroke="rgba(0, 242, 254, 0.22)"
			stroke-width="4"
			stroke-dasharray="14 8"
		/>

		<!-- Middle Core Hexagon -->
		<polygon
			points="256,88 392,166 392,322 256,400 120,322 120,166"
			fill="rgba(13, 17, 23, 0.85)"
			stroke="url(#logoCyanEmerald)"
			stroke-width="7"
			filter="url(#logoGlow)"
		/>

		<!-- Neural Circuit Conduits -->
		<line x1="256" y1="88" x2="256" y2="190" stroke="url(#logoCyanEmerald)" stroke-width="4" stroke-linecap="round" />
		<line x1="392" y1="166" x2="310" y2="220" stroke="url(#logoCyanEmerald)" stroke-width="4" stroke-linecap="round" />
		<line x1="392" y1="322" x2="310" y2="292" stroke="url(#logoCyanEmerald)" stroke-width="4" stroke-linecap="round" />
		<line x1="256" y1="400" x2="256" y2="322" stroke="url(#logoCyanEmerald)" stroke-width="4" stroke-linecap="round" />
		<line x1="120" y1="322" x2="202" y2="292" stroke="url(#logoCyanEmerald)" stroke-width="4" stroke-linecap="round" />
		<line x1="120" y1="166" x2="202" y2="220" stroke="url(#logoCyanEmerald)" stroke-width="4" stroke-linecap="round" />

		<!-- 6 Peripheral Organ Nodes -->
		<circle cx="256" cy="88" r="14" fill="#00f2fe" filter="url(#logoGlow)" />
		<circle cx="256" cy="88" r="7" fill="#ffffff" />

		<circle cx="392" cy="166" r="14" fill="#00d2ff" filter="url(#logoGlow)" />
		<circle cx="392" cy="166" r="7" fill="#ffffff" />

		<circle cx="392" cy="322" r="14" fill="#10b981" filter="url(#logoGlow)" />
		<circle cx="392" cy="322" r="7" fill="#ffffff" />

		<circle cx="256" cy="400" r="14" fill="#10b981" filter="url(#logoGlow)" />
		<circle cx="256" cy="400" r="7" fill="#ffffff" />

		<circle cx="120" cy="322" r="14" fill="#6366f1" filter="url(#logoGlow)" />
		<circle cx="120" cy="322" r="7" fill="#ffffff" />

		<circle cx="120" cy="166" r="14" fill="#00f2fe" filter="url(#logoGlow)" />
		<circle cx="120" cy="166" r="7" fill="#ffffff" />

		<!-- Central Nucleus -->
		<polygon
			points="256,194 310,225 310,287 256,318 202,287 202,225"
			fill="rgba(0, 242, 254, 0.2)"
			stroke="url(#logoCyanEmerald)"
			stroke-width="5"
		/>

		<circle cx="256" cy="256" r="28" fill="url(#logoCyanEmerald)" filter="url(#logoGlow)" />
		<circle cx="256" cy="256" r="14" fill="#ffffff" />
	</svg>
</div>
