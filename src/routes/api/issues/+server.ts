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
				issues(first: 10, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
					totalCount
					nodes {
						number
						title
						url
						createdAt
						updatedAt
						state
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

		const allIssues: any[] = [];
		const totals: Record<string, number> = {};

		AGENT_REPOS.forEach((repo, idx) => {
			const repoData = response[`repo${idx}`];
			if (!repoData?.issues?.nodes) return;

			totals[repo] = repoData.issues.totalCount;

			repoData.issues.nodes.forEach((issue: any) => {
				allIssues.push({
					repo,
					number: issue.number,
					title: issue.title,
					url: issue.url,
					state: issue.state,
					createdAt: issue.createdAt,
					updatedAt: issue.updatedAt,
					author: issue.author
						? {
								login: issue.author.login,
								avatarUrl: issue.author.avatarUrl,
								url: issue.author.url
							}
						: null,
					labels: (issue.labels?.nodes || []).map((l: any) => ({
						name: l.name,
						color: l.color,
						description: l.description
					})),
					assignees: (issue.assignees?.nodes || []).map((a: any) => ({
						login: a.login,
						avatarUrl: a.avatarUrl
					}))
				});
			});
		});

		return json({ success: true, data: allIssues, totals });
	} catch (e) {
		console.error('Failed to fetch org-wide issues:', e);
		return json({ success: false, error: 'Failed to fetch issues' }, { status: 500 });
	}
}
