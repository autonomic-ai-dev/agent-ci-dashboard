import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		console.error('Auth Error in layout.server.ts:', e);
	}
	
	return {
		session
	};
};
