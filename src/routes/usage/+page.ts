import type { PageLoad } from './$types';
import type { UsageSummaryResponse } from '../api/usage/+server';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/usage');
	const usage: UsageSummaryResponse = await res.json();
	return { usage };
};
