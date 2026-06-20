import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Octokit } from 'octokit';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export async function load(event) {
	const { params, setHeaders } = event;
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

	const repo = params.name;
	const owner = 'autonomic-ai-dev';
	const octokit = new Octokit({ auth: token });

	try {
		const query = `
			query getRepoDetails($owner: String!, $repo: String!) {
				repository(owner: $owner, name: $repo) {
					readme: object(expression: "HEAD:README.md") {
						... on Blob {
							text
						}
					}
					releases(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) {
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
					defaultBranchRef {
						target {
							... on Commit {
								history(first: 10) {
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

		const response: any = await octokit.graphql(query, { owner, repo });
		const repoData = response.repository;

		if (!repoData) {
			throw error(404, 'Repository not found');
		}

		// Render README
		let readmeHtml = '<p>No README found.</p>';
		if (repoData.readme && repoData.readme.text) {
			const parsed = await marked.parse(repoData.readme.text);
			readmeHtml = DOMPurify.sanitize(parsed);
		}

		// Map releases
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
		const releasesPageInfo = repoData.releases.pageInfo;

		// Map recent commits and their CI runs
		const commits = repoData.defaultBranchRef?.target?.history?.nodes.map((commit: any) => {
			const validRuns = (commit.checkSuites?.nodes || []).filter((cs: any) => cs.workflowRun !== null);
			
			// Deduplicate runs by workflow name, keeping the most recent attempt
			const sortedRuns = validRuns.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
			const uniqueRunsMap = new Map();
			for (const run of sortedRuns) {
				const name = run.workflowRun?.workflow?.name || 'Workflow';
				if (!uniqueRunsMap.has(name)) {
					uniqueRunsMap.set(name, run);
				}
			}
			const latestUniqueRuns = Array.from(uniqueRunsMap.values());
			
			let overallStatus = 'unknown';
			if (latestUniqueRuns.length === 0) {
				overallStatus = 'no-runs';
			} else {
				const isPending = latestUniqueRuns.some((run: any) => run.status !== 'COMPLETED');
				const hasFailure = latestUniqueRuns.some((run: any) => run.status === 'COMPLETED' && (run.conclusion === 'FAILURE' || run.conclusion === 'TIMED_OUT' || run.conclusion === 'CANCELLED'));
				
				if (hasFailure) {
					overallStatus = 'failure';
				} else if (isPending) {
					overallStatus = 'pending';
				} else {
					const allSuccess = latestUniqueRuns.every((run: any) => run.status === 'COMPLETED' && (run.conclusion === 'SUCCESS' || run.conclusion === 'SKIPPED'));
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
				runs: latestUniqueRuns.map((run: any) => ({
					id: run.workflowRun?.databaseId || null,
					name: run.workflowRun?.workflow?.name || 'Workflow',
					url: run.workflowRun?.url,
					status: run.status !== 'COMPLETED' ? run.status.toLowerCase() : (run.conclusion || 'completed').toLowerCase(),
					updatedAt: run.updatedAt
				}))
			};
		}) || [];
		const commitsPageInfo = repoData.defaultBranchRef?.target?.history?.pageInfo || { hasNextPage: false, endCursor: null };

		return {
			repo,
			readmeHtml,
			releases,
			releasesPageInfo,
			commits,
			commitsPageInfo,
			repoUrl: `https://github.com/${owner}/${repo}`
		};
	} catch (e) {
		console.error(`Failed to load details for ${repo} via GraphQL:`, e);
		throw error(500, 'Failed to fetch repository details from GitHub');
	}
}
