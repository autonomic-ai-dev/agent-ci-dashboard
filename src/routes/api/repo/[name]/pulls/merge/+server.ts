import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';

const GITHUB_OWNER = 'autonomic-ai-dev';

export async function POST(event) {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		// AUTH_URL not configured
	}
	// @ts-ignore
	const token = session?.accessToken;

	if (!session || !token) {
		return json({ success: false, error: 'Unauthorized. Please sign in.' }, { status: 401 });
	}

	const repo = event.params.name;
	const body = await event.request.json();
	const { pullNumber } = body;

	if (!pullNumber) {
		return json({ success: false, error: 'Missing pullNumber' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		await octokit.rest.pulls.merge({
			owner: GITHUB_OWNER,
			repo,
			pull_number: pullNumber,
			merge_method: 'squash'
		});

		return json({ success: true });
	} catch (e: any) {
		console.error(`Failed to merge PR #${pullNumber} for ${repo}:`, e);
		const message = e?.response?.data?.message || 'Failed to merge pull request';
		return json({ success: false, error: message }, { status: 500 });
	}
}
