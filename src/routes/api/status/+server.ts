import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';

const GITHUB_OWNER = 'autonomic-ai-dev';

const AGENT_REPOS = [
	'agent-body', 'agent-brain', 'agent-eyes', 'agent-heart', 
	'agent-immune', 'agent-mouth', 'agent-muscle', 'agent-nerves', 'agent-spine'
];

export async function GET(event) {
	const { setHeaders } = event;
	const session = await event.locals.auth();
	// @ts-ignore
	const token = session?.accessToken || env.GITHUB_TOKEN;

	setHeaders({
		'Cache-Control': 'max-age=300, s-maxage=300, stale-while-revalidate=600'
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
				committedDate
				author {
					user {
						login
						avatarUrl
						url
					}
				}
				checkSuites(first: 3) {
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
					}
				}
				defaultBranchRef {
					target {
						... on Commit {
							...CommitDetails
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
			
			const latestTagNode = repoData?.refs?.nodes?.[0];
			const tagName = latestTagNode ? latestTagNode.name : null;

			if (!repoData || !repoData.defaultBranchRef) {
				return {
					repo,
					tag: tagName,
					status: 'no-runs',
					sha: null,
					htmlUrl: `https://github.com/${GITHUB_OWNER}/${repo}`,
					actor: null,
					updatedAt: null,
					workflows: []
				};
			}

			const target = repoData.defaultBranchRef.target;
			const sha = target.oid;
			const actorNode = target.author?.user;
			
			const actor = actorNode ? {
				login: actorNode.login,
				avatarUrl: actorNode.avatarUrl,
				url: actorNode.url
			} : null;

			const validRuns = (target.checkSuites?.nodes || []).filter((node: any) => node && node.workflowRun);

			const workflows = validRuns.map((run: any) => ({
				id: run.workflowRun?.databaseId || null,
				name: run.workflowRun?.workflow?.name || 'Workflow',
				status: run.status !== 'COMPLETED' ? run.status.toLowerCase() : (run.conclusion || 'completed').toLowerCase(),
				updatedAt: run.updatedAt
			}));

			// Sort workflows: Failures first, then Pending, then Success. Secondary sort by date.
			const getPriority = (status: string) => {
				if (['failure', 'timed_out', 'cancelled', 'action_required'].includes(status)) return 0;
				if (['in_progress', 'queued', 'pending'].includes(status)) return 1;
				return 2;
			};

			workflows.sort((a: any, b: any) => {
				const pDiff = getPriority(a.status) - getPriority(b.status);
				if (pDiff !== 0) return pDiff;
				return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
			});

			let aggregateStatus = 'success';
			if (workflows.length === 0) {
				aggregateStatus = 'no-runs';
			} else if (workflows.some((w: any) => w.status === 'failure' || w.status === 'timed_out' || w.status === 'cancelled' || w.status === 'action_required')) {
				aggregateStatus = 'failure';
			} else if (workflows.some((w: any) => w.status === 'in_progress' || w.status === 'queued' || w.status === 'pending')) {
				aggregateStatus = 'pending';
			}

			return {
				repo,
				tag: tagName,
				status: aggregateStatus,
				sha,
				htmlUrl: `https://github.com/${GITHUB_OWNER}/${repo}`,
				actor,
				updatedAt: target.committedDate,
				workflows
			};
		});

		return json({ success: true, data: statuses });
	} catch (e: any) {
		console.error('Failed to fetch status:', e);
		return json({ success: false, error: 'Failed to fetch status' }, { status: 500 });
	}
}
