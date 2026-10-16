import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';

const GITHUB_OWNER = 'autonomic-ai-dev';

export async function POST(event) {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		// AUTH_URL not configured — fallback to env.GITHUB_TOKEN
	}
	// @ts-ignore
	const token = session?.accessToken || env.GITHUB_TOKEN;

	if (!token) {
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
		const res = await octokit.rest.pulls.updateBranch({
			owner: GITHUB_OWNER,
			repo,
			pull_number: pullNumber
		});

		return json({
			success: true,
			message: res.data.message || 'Branch updated successfully with latest base branch.'
		});
	} catch (e: any) {
		console.error(`Failed to update branch for PR #${pullNumber} in ${repo}:`, e);
		const message = e?.response?.data?.message || e.message || 'Failed to update branch';
		return json({ success: false, error: message }, { status: 500 });
	}
}
