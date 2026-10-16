import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';

const GITHUB_OWNER = 'autonomic-ai-dev';

const AGENT_REPOS = [
	'agent-body',
	'agent-brain',
	'agent-spine',
	'agent-muscle',
	'agent-heart',
	'agent-mouth',
	'agent-immune',
	'agent-nerves',
	'agent-eyes',
	'agent-tui',
	'agent-ci-dashboard'
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
		'Cache-Control': 'max-age=0, s-maxage=60, stale-while-revalidate=120'
	});

	const octokit = new Octokit({
		auth: token
	});

	try {
		// Construct dynamic GraphQL query to fetch all repos in one shot using aliases
		const repoQueries = AGENT_REPOS.map(
			(repo, idx) => `
			repo${idx}: repository(owner: "${GITHUB_OWNER}", name: "${repo}") {
				...RepoDetails
			}
		`
		).join('\n');

		const query = `
			fragment CommitDetails on Commit {
				oid
				committedDate
				messageHeadline
				author {
					user {
						login
						avatarUrl
						url
					}
				}
				checkSuites(first: 50) {
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
				history(first: 10) {
					nodes {
						oid
						committedDate
						messageHeadline
						checkSuites(first: 50) {
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
				}
			}

			fragment RepoDetails on Repository {
				name
				refs(refPrefix: "refs/tags/", last: 1) {
					nodes {
						name
						target {
							... on Commit {
								oid
								checkSuites(first: 50) {
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
						}
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

		let response: any;
		try {
			response = await octokit.graphql(query);
		} catch (graphQLErr: any) {
			if (graphQLErr.data) {
				response = graphQLErr.data;
			} else {
				throw graphQLErr;
			}
		}

		const statuses = AGENT_REPOS.map((repo, idx) => {
			const repoData = response[`repo${idx}`];

			const latestTagNode = repoData?.refs?.nodes?.[0];
			const tagName = latestTagNode ? latestTagNode.name : null;
			const tagTarget = latestTagNode?.target || null;

			if (!repoData || !repoData.defaultBranchRef) {
				return {
					repo,
					tag: tagName,
					status: 'no-runs',
					sha: null,
					testedSha: null,
					isDocOnlyUpdate: false,
					messageHeadline: null,
					htmlUrl: `https://github.com/${GITHUB_OWNER}/${repo}`,
					actor: null,
					updatedAt: null,
					workflows: []
				};
			}

			const target = repoData.defaultBranchRef.target;
			const sha = target.oid;
			const actorNode = target.author?.user;

			const actor = actorNode
				? {
						login: actorNode.login,
						avatarUrl: actorNode.avatarUrl,
						url: actorNode.url
					}
				: null;

			let validRuns = (target.checkSuites?.nodes || []).filter(
				(node: any) => node && node.workflowRun
			);

			// If HEAD commit had no CI runs (e.g., documentation or chore change with paths-ignore),
			// inspect the recent history of the default branch to find the most recent commit that ran CI.
			let isDocOnlyUpdate = false;
			let testedSha = sha;
			if (validRuns.length === 0 && target.history?.nodes?.length) {
				const testedCommit = target.history.nodes.find(
					(c: any) => (c.checkSuites?.nodes || []).some((n: any) => n && n.workflowRun)
				);
				if (testedCommit) {
					validRuns = (testedCommit.checkSuites?.nodes || []).filter(
						(node: any) => node && node.workflowRun
					);
					isDocOnlyUpdate = true;
					testedSha = testedCommit.oid;
				}
			}

			// Merge tag commit check suites if tag points to a different commit
			if (tagTarget && tagTarget.oid !== sha && tagTarget.oid !== testedSha) {
				const tagRuns = (tagTarget.checkSuites?.nodes || []).filter(
					(node: any) => node && node.workflowRun
				);
				validRuns.push(...tagRuns);
			}

			// Deduplicate runs by workflow name, keeping most recent by workflowRun databaseId
			const sortedRuns = validRuns.sort(
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

			const workflows = latestUniqueRuns.map((run: any) => ({
				id: run.workflowRun?.databaseId || null,
				name: run.workflowRun?.workflow?.name || 'Workflow',
				status:
					run.status !== 'COMPLETED'
						? run.status.toLowerCase()
						: (run.conclusion || 'completed').toLowerCase(),
				updatedAt: run.updatedAt
			}));

			// Sort workflows: failures/timed_out first, then cancelled, then pending, then success
			const getPriority = (status: string) => {
				if (['failure', 'timed_out'].includes(status)) return 0;
				if (['cancelled'].includes(status)) return 1;
				if (['action_required', 'in_progress', 'queued', 'pending'].includes(status)) return 2;
				return 3;
			};

			workflows.sort((a: any, b: any) => {
				const pDiff = getPriority(a.status) - getPriority(b.status);
				if (pDiff !== 0) return pDiff;
				return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
			});

			let aggregateStatus = 'success';
			if (workflows.length === 0) {
				aggregateStatus = 'no-runs';
			} else if (
				workflows.some(
					(w: any) =>
						w.status === 'failure' || w.status === 'timed_out' || w.status === 'action_required'
				)
			) {
				aggregateStatus = 'failure';
			} else if (workflows.some((w: any) => w.status === 'cancelled')) {
				aggregateStatus = 'cancelled';
			} else if (
				workflows.some(
					(w: any) => w.status === 'in_progress' || w.status === 'queued' || w.status === 'pending'
				)
			) {
				aggregateStatus = 'pending';
			}

			return {
				repo,
				tag: tagName,
				status: aggregateStatus,
				sha,
				testedSha,
				isDocOnlyUpdate,
				messageHeadline: target.messageHeadline,
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
