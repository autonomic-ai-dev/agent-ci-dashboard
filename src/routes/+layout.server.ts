import type { LayoutServerLoad } from './$types';
import pkg from '../../package.json';
import { getAutonomicFormulae } from '$lib/server/formula';

export const load: LayoutServerLoad = async (event) => {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		console.error('Auth Error in layout.server.ts:', e);
	}

	const formulae = await getAutonomicFormulae();

	return {
		session,
		ecosystemVersion: `v${formulae.autonomic}`,
		stackVersion: `v${formulae.stack}`,
		formulaVersion: `v${formulae.autonomic}`,
		organVersions: formulae.organs
	};
};

