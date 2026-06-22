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
			query getIssues($owner: String!, $repo: String!, $first: Int!, $after: String) {
				repository(owner: $owner, name: $repo) {
					issues(first: $first, after: $after, states: OPEN, orderBy: {field: CREATED_AT, direction: DESC}) {
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
			}
		`;

		const response: any = await octokit.graphql(query, {
			owner: GITHUB_OWNER,
			repo,
			first: 10,
			after: after || null
		});

		const issueData = response.repository?.issues;

		if (!issueData) {
			return json({ success: false, error: 'No issue data found' }, { status: 404 });
		}

		const issues = issueData.nodes.map((issue: any) => ({
			number: issue.number,
			title: issue.title,
			url: issue.url,
			state: issue.state,
			createdAt: issue.createdAt,
			updatedAt: issue.updatedAt,
			author: issue.author
				? { login: issue.author.login, avatarUrl: issue.author.avatarUrl, url: issue.author.url }
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
		}));

		return json({
			success: true,
			data: issues,
			pageInfo: issueData.pageInfo
		});
	} catch (e) {
		console.error(`Failed to fetch issues for ${repo}:`, e);
		return json({ success: false, error: 'Failed to fetch issues' }, { status: 500 });
	}
}
