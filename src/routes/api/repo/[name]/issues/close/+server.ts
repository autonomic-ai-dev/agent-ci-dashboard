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
	const { issueNumber } = body;

	if (!issueNumber) {
		return json({ success: false, error: 'Missing issueNumber' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		await octokit.rest.issues.update({
			owner: GITHUB_OWNER,
			repo,
			issue_number: issueNumber,
			state: 'closed'
		});

		return json({ success: true });
	} catch (e: any) {
		console.error(`Failed to close issue #${issueNumber} for ${repo}:`, e);
		const message = e?.response?.data?.message || 'Failed to close issue';
		return json({ success: false, error: message }, { status: 500 });
	}
}
