import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		// AUTH_URL may not be configured — fall back to unauthenticated mode
	}
	
	return {
		session
	};
};
