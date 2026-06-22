import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';

const GITHUB_OWNER = 'autonomic-ai-dev';

export async function GET(event) {
	const { params, url, setHeaders } = event;
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		// AUTH_URL not configured — fall back to GITHUB_TOKEN
	}
	// @ts-ignore
	const token = session?.accessToken || env.GITHUB_TOKEN;

	setHeaders({
		'Cache-Control': 'max-age=0, s-maxage=30, stale-while-revalidate=60'
	});

	const repo = params.name;
	const after = url.searchParams.get('after');

	if (!repo) {
		return json({ success: false, error: 'Missing repo name' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		const query = `
			query getPRs($owner: String!, $repo: String!, $first: Int!, $after: String) {
				repository(owner: $owner, name: $repo) {
					pullRequests(first: $first, after: $after, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
						pageInfo {
							hasNextPage
							endCursor
						}
						nodes {
							number
							title
							url
							createdAt
							updatedAt
							mergeable
							headRefName
							baseRefName
							author {
								login
								avatarUrl
								url
							}
							labels(first: 10) {
								nodes {
									name
									color
									description
								}
							}
							assignees(first: 5) {
								nodes {
									login
									avatarUrl
								}
							}
							commits(last: 1) {
								nodes {
									commit {
										oid
										checkSuites(first: 20) {
											nodes {
												status
												conclusion
												updatedAt
												workflowRun {
													databaseId
													url
													workflow {
														name
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		`;

		const response: any = await octokit.graphql(query, {
			owner: GITHUB_OWNER,
			repo,
			first: 10,
			after: after || null
		});

		const prData = response.repository?.pullRequests;

		if (!prData) {
			return json({ success: false, error: 'No pull request data found' }, { status: 404 });
		}

		const pulls = prData.nodes.map((pr: any) => {
			const latestCommit = pr.commits?.nodes?.[0]?.commit;
			const checkSuites = latestCommit?.checkSuites?.nodes || [];

			const validRuns = checkSuites.filter((cs: any) => cs.workflowRun !== null);

			const sortedRuns = [...validRuns].sort(
				(a: any, b: any) => (b.workflowRun?.databaseId || 0) - (a.workflowRun?.databaseId || 0)
			);
			const uniqueRunsMap = new Map();
			for (const run of sortedRuns) {
				const name = run.workflowRun?.workflow?.name || 'Workflow';
				if (!uniqueRunsMap.has(name)) {
					uniqueRunsMap.set(name, run);
				}
			}
			const latestUniqueRuns = Array.from(uniqueRunsMap.values());

			let overallStatus: string;
			if (latestUniqueRuns.length === 0) {
				overallStatus = 'no-checks';
			} else {
				const hasFailure = latestUniqueRuns.some(
					(run: any) =>
						run.status === 'COMPLETED' &&
						(run.conclusion === 'FAILURE' ||
							run.conclusion === 'TIMED_OUT' ||
							run.conclusion === 'ACTION_REQUIRED')
				);
				const hasCancelled = latestUniqueRuns.some(
					(run: any) => run.status === 'COMPLETED' && run.conclusion === 'CANCELLED'
				);
				const isInProgress = latestUniqueRuns.some((run: any) => run.status === 'IN_PROGRESS');
				const isQueued = latestUniqueRuns.some((run: any) => run.status === 'QUEUED');

				if (hasFailure) overallStatus = 'failure';
				else if (hasCancelled) overallStatus = 'cancelled';
				else if (isInProgress) overallStatus = 'in_progress';
				else if (isQueued) overallStatus = 'queued';
				else overallStatus = 'success';
			}

			return {
				number: pr.number,
				title: pr.title,
				url: pr.url,
				createdAt: pr.createdAt,
				updatedAt: pr.updatedAt,
				mergeable: pr.mergeable,
				headRefName: pr.headRefName,
				baseRefName: pr.baseRefName,
				author: pr.author
					? { login: pr.author.login, avatarUrl: pr.author.avatarUrl, url: pr.author.url }
					: null,
				labels: (pr.labels?.nodes || []).map((l: any) => ({
					name: l.name,
					color: l.color,
					description: l.description
				})),
				assignees: (pr.assignees?.nodes || []).map((a: any) => ({
					login: a.login,
					avatarUrl: a.avatarUrl
				})),
				status: overallStatus,
				checks: latestUniqueRuns.map((run: any) => ({
					id: run.workflowRun?.databaseId || null,
					name: run.workflowRun?.workflow?.name || 'Workflow',
					url: run.workflowRun?.url,
					status:
						run.status !== 'COMPLETED'
							? run.status.toLowerCase()
							: (run.conclusion || 'completed').toLowerCase(),
					updatedAt: run.updatedAt
				}))
			};
		});

		return json({
			success: true,
			data: pulls,
			pageInfo: prData.pageInfo
		});
	} catch (e) {
		console.error(`Failed to fetch PRs for ${repo}:`, e);
		return json({ success: false, error: 'Failed to fetch pull requests' }, { status: 500 });
	}
}
