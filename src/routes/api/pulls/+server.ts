import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';

const GITHUB_OWNER = 'autonomic-ai-dev';

const AGENT_REPOS = [
	'agent-body',
	'agent-brain',
	'agent-eyes',
	'agent-heart',
	'agent-immune',
	'agent-mouth',
	'agent-muscle',
	'agent-nerves',
	'agent-spine'
];

export async function GET(event) {
	const { setHeaders } = event;
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

	const octokit = new Octokit({ auth: token });

	try {
		const repoQueries = AGENT_REPOS.map(
			(repo, idx) => `
			repo${idx}: repository(owner: "${GITHUB_OWNER}", name: "${repo}") {
				pullRequests(first: 10, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
					totalCount
					nodes {
						number
						title
						isDraft
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
		`
		).join('\n');

		const query = `
			query {
				${repoQueries}
			}
		`;

		const response: any = await octokit.graphql(query);

		const allPulls: any[] = [];
		const totals: Record<string, number> = {};

		AGENT_REPOS.forEach((repo, idx) => {
			const repoData = response[`repo${idx}`];
			if (!repoData?.pullRequests?.nodes) return;

			totals[repo] = repoData.pullRequests.totalCount;

			repoData.pullRequests.nodes.forEach((pr: any) => {
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

				allPulls.push({
					repo,
					number: pr.number,
					title: pr.title,
					isDraft: pr.isDraft,
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
				});
			});
		});

		return json({ success: true, data: allPulls, totals });
	} catch (e) {
		console.error('Failed to fetch org-wide PRs:', e);
		return json({ success: false, error: 'Failed to fetch pull requests' }, { status: 500 });
	}
}
