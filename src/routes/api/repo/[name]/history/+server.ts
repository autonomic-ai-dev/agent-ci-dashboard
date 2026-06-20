import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';

const GITHUB_OWNER = 'autonomic-ai-dev';

export async function GET(event) {
	const { params, url, setHeaders } = event;
	const session = await event.locals.auth();
	// @ts-ignore
	const token = session?.accessToken || env.GITHUB_TOKEN;

	setHeaders({
		'Cache-Control': 'max-age=0, s-maxage=60, stale-while-revalidate=120'
	});

	const repo = params.name;
	const type = url.searchParams.get('type');
	const after = url.searchParams.get('after');

	if (!repo || !type || !after) {
		return json({ success: false, error: 'Missing parameters' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		let query = '';
		
		if (type === 'releases') {
			query = `
				query getMoreReleases($owner: String!, $repo: String!, $after: String!) {
					repository(owner: $owner, name: $repo) {
						releases(first: 10, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
							pageInfo {
								hasNextPage
								endCursor
							}
							nodes {
								name
								tagName
								descriptionHTML
								url
								publishedAt
								author {
									login
									avatarUrl
									url
								}
							}
						}
					}
				}
			`;
		} else if (type === 'commits') {
			query = `
				query getMoreCommits($owner: String!, $repo: String!, $after: String!) {
					repository(owner: $owner, name: $repo) {
						defaultBranchRef {
							target {
								... on Commit {
									history(first: 10, after: $after) {
										pageInfo {
											hasNextPage
											endCursor
										}
										nodes {
											oid
											messageHeadline
											committedDate
											author {
												user {
													login
													avatarUrl
												}
											}
											checkSuites(first: 10) {
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
		} else {
			return json({ success: false, error: 'Invalid type parameter' }, { status: 400 });
		}

		const response: any = await octokit.graphql(query, { owner: GITHUB_OWNER, repo, after });
		const repoData = response.repository;

		if (type === 'releases') {
			const releases = repoData.releases.nodes.map((node: any) => ({
				name: node.name || node.tagName,
				tag: node.tagName,
				descriptionHtml: node.descriptionHTML || '<p>Release has no description.</p>',
				url: node.url,
				publishedAt: node.publishedAt,
				author: node.author ? {
					login: node.author.login,
					avatarUrl: node.author.avatarUrl,
					url: node.author.url
				} : null
			}));
			return json({
				success: true,
				data: releases,
				pageInfo: repoData.releases.pageInfo
			});
		} else if (type === 'commits') {
			const commits = repoData.defaultBranchRef?.target?.history?.nodes.map((commit: any) => {
				const validRuns = (commit.checkSuites?.nodes || []).filter((cs: any) => cs.workflowRun !== null);
				
				let overallStatus = 'unknown';
				if (validRuns.length === 0) {
					overallStatus = 'no-runs';
				} else {
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
				}

				return {
					sha: commit.oid,
					message: commit.messageHeadline,
					date: commit.committedDate,
					author: commit.author?.user ? {
						login: commit.author.user.login,
						avatarUrl: commit.author.user.avatarUrl
					} : null,
					status: overallStatus,
					runs: validRuns.map((run: any) => ({
						id: run.workflowRun?.databaseId || null,
						name: run.workflowRun?.workflow?.name || 'Workflow',
						url: run.workflowRun?.url,
						status: run.status !== 'COMPLETED' ? run.status.toLowerCase() : (run.conclusion || 'completed').toLowerCase(),
						updatedAt: run.updatedAt
					}))
				};
			}) || [];

			const pageInfo = repoData.defaultBranchRef?.target?.history?.pageInfo || { hasNextPage: false, endCursor: null };
			
			return json({
				success: true,
				data: commits,
				pageInfo
			});
		}
	} catch (e) {
		console.error(`Failed to load history via API:`, e);
		return json({ success: false, error: 'Failed to fetch' }, { status: 500 });
	}
}
