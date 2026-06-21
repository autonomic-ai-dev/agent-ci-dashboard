import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';

const GITHUB_OWNER = 'autonomic-ai-dev';

export async function POST(event) {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		// AUTH_URL not configured — fall back to GITHUB_TOKEN
	}
	// @ts-ignore
	const token = session?.accessToken;

	if (!session || !token) {
		return json({ success: false, error: 'Unauthorized. Please sign in.' }, { status: 401 });
	}

	const repo = event.params.name;
	const body = await event.request.json();
	const { runId, type } = body;

	if (!runId) {
		return json({ success: false, error: 'Missing run_id' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		if (type === 'failed') {
			await octokit.rest.actions.reRunWorkflowFailedJobs({
				owner: GITHUB_OWNER,
				repo,
				run_id: runId
			});
		} else {
			await octokit.rest.actions.reRunWorkflow({
				owner: GITHUB_OWNER,
				repo,
				run_id: runId
			});
		}

		return json({ success: true });
	} catch (e) {
		console.error(`Failed to rerun workflow for ${repo}:`, e);
		return json(
			{ success: false, error: 'Failed to rerun workflow. Ensure no other jobs are pending.' },
			{ status: 500 }
		);
	}
}
