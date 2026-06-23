import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		// AUTH_URL not configured
	}
	return { session };
};
