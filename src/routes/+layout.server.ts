import type { LayoutServerLoad } from './$types';
import pkg from '../../package.json';

export const load: LayoutServerLoad = async (event) => {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		console.error('Auth Error in layout.server.ts:', e);
	}

	return {
		session,
		ecosystemVersion: `v${pkg.version}`
	};
};
