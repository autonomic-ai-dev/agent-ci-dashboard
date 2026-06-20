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
	const session = await event.locals.auth();
	// @ts-ignore
	const token = session?.accessToken || env.GITHUB_TOKEN;

	setHeaders({
		'Cache-Control': 'max-age=60, s-maxage=60, stale-while-revalidate=120'
	});

	const octokit = new Octokit({
		auth: token
	});

	try {
		// Construct dynamic GraphQL query to fetch all repos in one shot using aliases
		const repoQueries = AGENT_REPOS.map((repo, idx) => `
			repo${idx}: repository(owner: "${GITHUB_OWNER}", name: "${repo}") {
				...RepoDetails
			}
		`).join('\n');

		const query = `
			fragment CommitDetails on Commit {
				oid
				pushedDate
				author {
					user {
						login
						avatarUrl
						url
					}
				}
				checkSuites(first: 10) {
					nodes {
						status
						conclusion
						updatedAt
						workflowRun {
							databaseId
							workflow {
								name
							}
						}
					}
				}
			}

			fragment RepoDetails on Repository {
				name
				refs(refPrefix: "refs/tags/", last: 1) {
					nodes {
						name
						target {
							... on Commit {
								...CommitDetails
							}
							... on Tag {
								target {
									... on Commit {
										...CommitDetails
									}
								}
							}
						}
					}
				}
			}

			query {
				${repoQueries}
			}
		`;

		const response: any = await octokit.graphql(query);

		const statuses = AGENT_REPOS.map((repo, idx) => {
			const repoData = response[`repo${idx}`];
			
			if (!repoData || !repoData.refs || repoData.refs.nodes.length === 0) {
				return {
					repo,
					tag: null,
					status: 'no-tags',
					sha: null,
					htmlUrl: `https://github.com/${GITHUB_OWNER}/${repo}`,
					actor: null,
					updatedAt: null,
					workflows: []
				};
			}

			const latestTagNode = repoData.refs.nodes[0];
			const target = latestTagNode.target.target || latestTagNode.target; // Handle Tag vs Commit targets
			const sha = target.oid;
			const actorNode = target.author?.user;
			
			const actor = actorNode ? {
				login: actorNode.login,
				avatarUrl: actorNode.avatarUrl,
				url: actorNode.url
			} : null;

			// Extract workflow runs from check suites
			const checkSuites = target.checkSuites?.nodes || [];
			const validRuns = checkSuites.filter((cs: any) => cs.workflowRun !== null);
			
			let overallStatus = 'unknown';
			let updatedAt = target.pushedDate || null;
			const workflows = [];

			if (validRuns.length === 0) {
				overallStatus = 'no-runs';
			} else {
				// Get latest update time from runs
				if (!updatedAt && validRuns[0]) {
					updatedAt = validRuns[0].updatedAt;
				}

				const isPending = validRuns.some((run: any) => run.status !== 'COMPLETED');
				const hasFailure = validRuns.some((run: any) => run.status === 'COMPLETED' && (run.conclusion === 'FAILURE' || run.conclusion === 'TIMED_OUT' || run.conclusion === 'CANCELLED'));
				
				if (isPending) {
					overallStatus = 'pending';
				} else if (hasFailure) {
					overallStatus = 'failure';
				} else {
					const allSuccess = validRuns.every((run: any) => run.status === 'COMPLETED' && (run.conclusion === 'SUCCESS' || run.conclusion === 'SKIPPED'));
					if (allSuccess) {
						overallStatus = 'success';
					}
				}

				for (const run of validRuns.slice(0, 10)) {
					const runName = run.workflowRun?.workflow?.name || 'Workflow';
					const statusString = run.status !== 'COMPLETED' ? run.status.toLowerCase() : (run.conclusion || 'completed').toLowerCase();
					workflows.push({
						id: run.workflowRun?.databaseId || Math.random().toString(),
						name: runName,
						status: statusString,
					});
				}
			}

			return {
				repo,
				tag: latestTagNode.name,
				status: overallStatus,
				sha: sha ? sha.substring(0, 7) : null,
				htmlUrl: `https://github.com/${GITHUB_OWNER}/${repo}/releases/tag/${latestTagNode.name}`,
				actor,
				updatedAt,
				workflows
			};
		});

		return json({
			success: true,
			data: statuses
		});
	} catch (error) {
		console.error('Failed to fetch global statuses via GraphQL:', error);
		return json({
			success: false,
			error: 'Failed to fetch statuses'
		}, { status: 500 });
	}
}
