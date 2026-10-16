import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';

const GITHUB_OWNER = 'autonomic-ai-dev';

export async function POST(event) {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		// AUTH_URL not configured
	}
	// @ts-ignore
	const token = session?.accessToken || env.GITHUB_TOKEN;

	if (!token) {
		return json({ success: false, error: 'Unauthorized. Please sign in.' }, { status: 401 });
	}

	const body = await event.request.json();
	const items: Array<{ repo: string; pullNumber: number }> = body?.items || [];

	if (!Array.isArray(items) || items.length === 0) {
		return json({ success: false, error: 'No pull requests provided to batch merge.' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });
	const results: Array<{ repo: string; pullNumber: number; success: boolean; error?: string }> = [];

	for (const item of items) {
		const { repo, pullNumber } = item;
		if (!repo || !pullNumber) continue;

		try {
			// Verify PR state before attempting merge
			const pr = await octokit.rest.pulls.get({
				owner: GITHUB_OWNER,
				repo,
				pull_number: pullNumber
			});

			if (pr.data.mergeable_state === 'behind') {
				results.push({
					repo,
					pullNumber,
					success: false,
					error: 'Branch is out of date with base branch'
				});
				continue;
			}

			if (pr.data.mergeable === false || pr.data.mergeable_state === 'dirty') {
				results.push({
					repo,
					pullNumber,
					success: false,
					error: 'PR has merge conflicts'
				});
				continue;
			}

			await octokit.rest.pulls.merge({
				owner: GITHUB_OWNER,
				repo,
				pull_number: pullNumber,
				merge_method: 'squash'
			});

			results.push({
				repo,
				pullNumber,
				success: true
			});
		} catch (e: any) {
			console.error(`Batch merge failed for ${repo}#${pullNumber}:`, e);
			const msg = e?.response?.data?.message || e.message || 'Failed to merge';
			results.push({
				repo,
				pullNumber,
				success: false,
				error: msg
			});
		}
	}

	const mergedCount = results.filter((r) => r.success).length;

	return json({
		success: mergedCount > 0 || results.length === 0,
		results,
		mergedCount,
		totalCount: results.length
	});
}
