import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Octokit } from 'octokit';
import { marked, Renderer } from 'marked';
import sanitizeHtml from 'sanitize-html';

// Custom renderer: wrap code blocks with header toolbar and copy button
const renderer = new Renderer();
renderer.code = ({ text, lang }) => {
	if (lang === 'mermaid') {
		return `<pre class="not-prose"><code class="not-prose language-mermaid">${text}</code></pre>`;
	}
	const langLabel = lang ? `<span class="code-lang-label">${lang}</span>` : '';
	const langClass = lang ? ` language-${lang}` : '';
	const copySvg =
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
	return `<figure class="code-block">
	<figcaption class="code-block-header">
		${langLabel}
		<button type="button" class="copy-btn" title="Copy code">${copySvg}<span class="copy-label">Copy</span></button>
	</figcaption>
	<pre class="not-prose"><code class="not-prose${langClass}">${text}</code></pre>
</figure>`;
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
					openPulls: pullRequests(states: OPEN) {
						totalCount
					}
					openIssues: issues(states: OPEN) {
						totalCount
					}
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
					'hr',
					'figure',
					'figcaption',
					'button',
					'svg',
					'path'
				],
				allowedAttributes: {
					'*': ['class', 'id'],
					a: ['href', 'name', 'target'],
					code: ['class'],
					pre: ['class'],
					img: ['src', 'alt', 'title', 'width', 'height'],
					button: ['type', 'title'],
					svg: [
						'xmlns',
						'width',
						'height',
						'viewBox',
						'fill',
						'stroke',
						'stroke-width',
						'stroke-linecap',
						'stroke-linejoin'
					],
					path: ['d']
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
			repoUrl: `https://github.com/${owner}/${repo}`,
			session: session ? { user: session.user } : null,
			pullCount: repoData.openPulls?.totalCount ?? 0,
			issueCount: repoData.openIssues?.totalCount ?? 0
		};
	} catch (e) {
		console.error(`Failed to load details for ${repo} via GraphQL:`, e);
		throw error(500, 'Failed to fetch repository details from GitHub');
	}
}
