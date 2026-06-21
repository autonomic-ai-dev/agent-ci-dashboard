import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Octokit } from 'octokit';
import { marked, Renderer } from 'marked';
import sanitizeHtml from 'sanitize-html';

// Custom renderer: wrap code blocks with not-prose to avoid Tailwind Typography backtick pseudo-elements
const renderer = new Renderer();
renderer.code = ({ text, lang }) => {
	const langClass = lang ? ` language-${lang}` : '';
	return `<pre class="not-prose"><code class="not-prose${langClass}">${text}</code></pre>`;
};
renderer.codespan = ({ text }) => {
	return `<span class="not-prose"><code class="inline-code">${text}</code></span>`;
};
marked.setOptions({ renderer });

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
					refs(refPrefix: "refs/tags/", last: 1) {
						nodes {
							name
							target {
								... on Commit {
									oid
									checkSuites(first: 100) {
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
										checkSuites(first: 100) {
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
			const rawHtml = await marked.parse(repoData.readme.text);
			readmeHtml = sanitizeHtml(rawHtml, {
				allowedTags: [
					...sanitizeHtml.defaults.allowedTags,
					'img',
					'h1',
					'h2',
					'h3',
					'h4',
					'h5',
					'h6',
					'span',
					'table',
					'thead',
					'tbody',
					'tr',
					'th',
					'td',
					'pre',
					'code',
					'hr'
				],
				allowedAttributes: {
					'*': ['class', 'id'],
					a: ['href', 'name', 'target'],
					code: ['class'],
					pre: ['class'],
					img: ['src', 'alt', 'title', 'width', 'height']
				}
			});
		}

		// Map releases
		const releases = repoData.releases.nodes.map((node: any) => ({
			name: node.name || node.tagName,
			tag: node.tagName,
			descriptionHtml: node.descriptionHTML || '<p>Release has no description.</p>',
			url: node.url,
			publishedAt: node.publishedAt,
			author: node.author
				? {
						login: node.author.login,
						avatarUrl: node.author.avatarUrl,
						url: node.author.url
					}
				: null
		}));
		const releasesPageInfo = repoData.releases.pageInfo;

		// Get tag commit CI runs for merging with latest commit
		const tagRef = repoData?.refs?.nodes?.[0] || null;
		const tagCommitSha = tagRef?.target?.oid || null;

		// Map recent commits and their CI runs
		const commits =
			repoData.defaultBranchRef?.target?.history?.nodes.map((commit: any, idx: number) => {
				const validRuns = (commit.checkSuites?.nodes || []).filter(
					(cs: any) => cs.workflowRun !== null
				);

				// Merge tag commit check suites into the first (latest) commit if tag points to a different commit
				if (idx === 0 && tagCommitSha && tagCommitSha !== commit.oid) {
					const tagRuns = (tagRef?.target?.checkSuites?.nodes || []).filter(
						(cs: any) => cs.workflowRun !== null
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

				let overallStatus = 'unknown';
				if (latestUniqueRuns.length === 0) {
					overallStatus = 'no-runs';
				} else {
					const isPending = latestUniqueRuns.some((run: any) => run.status !== 'COMPLETED');
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

					if (hasFailure) {
						overallStatus = 'failure';
					} else if (hasCancelled) {
						overallStatus = 'cancelled';
					} else if (isPending) {
						overallStatus = 'pending';
					} else {
						const allSuccess = latestUniqueRuns.every(
							(run: any) =>
								run.status === 'COMPLETED' &&
								(run.conclusion === 'SUCCESS' || run.conclusion === 'SKIPPED')
						);
						if (allSuccess) {
							overallStatus = 'success';
						}
					}
				}

				return {
					sha: commit.oid,
					message: commit.messageHeadline,
					date: commit.committedDate,
					author: commit.author?.user
						? {
								login: commit.author.user.login,
								avatarUrl: commit.author.user.avatarUrl
							}
						: null,
					status: overallStatus,
					runs: latestUniqueRuns.map((run: any) => ({
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
			}) || [];
		const commitsPageInfo = repoData.defaultBranchRef?.target?.history?.pageInfo || {
			hasNextPage: false,
			endCursor: null
		};

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
