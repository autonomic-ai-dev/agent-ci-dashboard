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

	const repo = event.params.name;
	const body = await event.request.json();
	const { pullNumber } = body;

	if (!pullNumber) {
		return json({ success: false, error: 'Missing pullNumber' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		// First verify PR status and mergeability
		const prInfo = await octokit.rest.pulls.get({
			owner: GITHUB_OWNER,
			repo,
			pull_number: pullNumber
		});

		const mergeableState = prInfo.data.mergeable_state;
		if (mergeableState === 'behind') {
			return json(
				{
					success: false,
					error: 'Branch is out of date with the base branch. Please click "Update Branch" first.',
					isBehind: true
				},
				{ status: 422 }
			);
		}

		if (prInfo.data.mergeable === false || mergeableState === 'dirty') {
			return json(
				{
					success: false,
					error: 'PR has merge conflicts that must be resolved manually.',
					isConflicting: true
				},
				{ status: 422 }
			);
		}

		try {
			await octokit.rest.pulls.merge({
				owner: GITHUB_OWNER,
				repo,
				pull_number: pullNumber,
				merge_method: 'squash'
			});

			return json({ success: true, merged: true });
		} catch (mergeErr: any) {
			const errMsg = mergeErr?.response?.data?.message || mergeErr.message || '';
			if (errMsg.toLowerCase().includes('merge queue')) {
				console.log(`Repository ruleset requires Merge Queue for ${repo}#${pullNumber}. Enqueueing via GraphQL...`);
				try {
					const nodeId = prInfo.data.node_id;
					const mutation = `
						mutation Enqueue($pullRequestId: ID!) {
							enqueuePullRequest(input: { pullRequestId: $pullRequestId }) {
								mergeQueueEntry {
									id
									state
									position
								}
							}
						}
					`;
					const gqlRes: any = await octokit.graphql(mutation, { pullRequestId: nodeId });
					const entry = gqlRes?.enqueuePullRequest?.mergeQueueEntry;
					return json({
						success: true,
						enqueued: true,
						position: entry?.position ?? 1,
						message: `PR #${pullNumber} added to merge queue (position ${entry?.position ?? 1})`
					});
				} catch (gqlErr: any) {
					console.error(`Failed to enqueue PR #${pullNumber} into merge queue:`, gqlErr);
					const gqlMsg = gqlErr?.errors?.[0]?.message || gqlErr?.message || errMsg;
					return json({ success: false, error: gqlMsg }, { status: 422 });
				}
			}
			throw mergeErr;
		}
	} catch (e: any) {
		console.error(`Failed to merge PR #${pullNumber} for ${repo}:`, e);
		const message = e?.response?.data?.message || e.message || 'Failed to merge pull request';
		return json({ success: false, error: message }, { status: e?.status || 500 });
	}
}
