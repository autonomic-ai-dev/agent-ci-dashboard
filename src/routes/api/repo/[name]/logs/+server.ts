import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';
import AdmZip from 'adm-zip';

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

	const repo = params.name;
	const runIdStr = url.searchParams.get('runId') || url.searchParams.get('run_id');

	if (!repo || !runIdStr) {
		return json({ success: false, error: 'Missing run_id or repo' }, { status: 400 });
	}

	const run_id = parseInt(runIdStr, 10);
	if (isNaN(run_id)) {
		return json({ success: false, error: 'Invalid run_id' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		// GitHub returns a redirect to the actual zip file for completed runs
		const response = await octokit.rest.actions.downloadWorkflowRunLogs({
			owner: GITHUB_OWNER,
			repo,
			run_id
		});

		// response.data is an ArrayBuffer when successful
		const zipBuffer = Buffer.from(response.data as ArrayBuffer);
		const zip = new AdmZip(zipBuffer);

		const zipEntries = zip.getEntries();
		let allLogs = '';

		// Sort entries by name to preserve step order (e.g., 1_setup.txt, 2_build.txt)
		const textEntries = zipEntries
			.filter((e) => e.entryName.endsWith('.txt'))
			.sort((a, b) => a.entryName.localeCompare(b.entryName));

		if (textEntries.length === 0) {
			setHeaders({
				'Cache-Control': 'max-age=60, s-maxage=60, stale-while-revalidate=120'
			});
			return json({ success: true, logs: 'No text logs found in archive.', status: 'completed' });
		}

		for (const entry of textEntries) {
			const content = zip.readAsText(entry);
			const cleanContent = content.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /gm, '');

			allLogs += `\n--- [${entry.entryName}] ---\n\n`;
			allLogs += cleanContent;
		}

		setHeaders({
			'Cache-Control': 'max-age=120, s-maxage=120, stale-while-revalidate=300'
		});

		return json({ success: true, logs: allLogs, status: 'completed', inProgress: false });
	} catch (e: any) {
		// If downloadWorkflowRunLogs fails (404 for running runs / expired logs, or 403 for permissions):
		try {
			const runDetails = await octokit.rest.actions.getWorkflowRun({
				owner: GITHUB_OWNER,
				repo,
				run_id
			});

			const run = runDetails.data;
			const isRunning = run.status === 'in_progress' || run.status === 'queued';

			if (isRunning) {
				setHeaders({
					'Cache-Control': 'no-cache, no-store, must-revalidate'
				});

				const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
					owner: GITHUB_OWNER,
					repo,
					run_id
				});

				const jobs = jobsResponse.data.jobs || [];
				let liveSummary = `════════════════════════════════════════════════════════════════════════════════\n`;
				liveSummary += `⚡ WORKFLOW EXECUTION IN PROGRESS\n`;
				liveSummary += `════════════════════════════════════════════════════════════════════════════════\n`;
				liveSummary += `Workflow:  ${run.name} (run #${run.run_number}, attempt #${run.run_attempt})\n`;
				liveSummary += `Status:    ${(run.status || 'unknown').toUpperCase()} ${run.conclusion ? `(${run.conclusion})` : ''}\n`;
				liveSummary += `Event:     ${run.event} on branch "${run.head_branch}"\n`;
				liveSummary += `Commit:    ${run.head_sha.substring(0, 8)} - ${run.head_commit?.message?.split('\n')[0] || ''}\n`;
				liveSummary += `Started:   ${run.run_started_at || run.created_at}\n\n`;
				liveSummary += `─── Active Jobs & Step Progress ───\n\n`;

				if (jobs.length === 0) {
					liveSummary += `Job is initializing on GitHub Actions runner pool...\n`;
				} else {
					for (const job of jobs) {
						const jobStatusIcon =
							job.conclusion === 'success'
								? '✓'
								: job.conclusion === 'failure'
								? '✗'
								: job.status === 'in_progress'
								? '⏳'
								: '○';
						liveSummary += `${jobStatusIcon} Job: ${job.name} [${job.status.toUpperCase()}${job.conclusion ? ` - ${job.conclusion.toUpperCase()}` : ''}]\n`;
						if (job.runner_name) {
							liveSummary += `   Runner: ${job.runner_name}\n`;
						}
						if (job.steps && job.steps.length > 0) {
							for (const step of job.steps) {
								const icon =
									step.conclusion === 'success'
										? '✓'
										: step.conclusion === 'failure'
										? '✗'
										: step.status === 'in_progress'
										? '⏳'
										: '○';
								const duration =
									step.started_at && step.completed_at
										? ` (${Math.round((new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 1000)}s)`
										: step.status === 'in_progress'
										? ' (running...)'
										: '';
								liveSummary += `     ${icon} Step ${step.number}: ${step.name} [${step.status}${step.conclusion ? ` / ${step.conclusion}` : ''}]${duration}\n`;
							}
						} else {
							liveSummary += `     ○ Steps are queued and waiting for runner pickup...\n`;
						}
						liveSummary += `\n`;
					}
				}

				liveSummary += `════════════════════════════════════════════════════════════════════════════════\n`;
				liveSummary += `ℹ️  GitHub Actions flushes and packages full terminal stdout/stderr logs into\n`;
				liveSummary += `   an archive once the workflow run finishes.\n`;
				liveSummary += `   This terminal view auto-refreshes step progression while active.\n`;
				liveSummary += `════════════════════════════════════════════════════════════════════════════════\n`;

				return json({
					success: true,
					logs: liveSummary,
					status: run.status,
					inProgress: true,
					html_url: run.html_url
				});
			} else {
				setHeaders({
					'Cache-Control': 'max-age=60, s-maxage=60, stale-while-revalidate=120'
				});

				const completedSummary =
					`Logs expired or not retained by GitHub for run #${run.run_number}.\n\n` +
					`Workflow:  ${run.name}\n` +
					`Status:    ${run.status} (${run.conclusion || 'completed'})\n` +
					`Branch:    ${run.head_branch}\n` +
					`Finished:  ${run.updated_at}\n\n` +
					`Note: GitHub automatically purges workflow run logs after 90 days.\n` +
					`Direct URL: ${run.html_url}`;

				return json(
					{
						success: false,
						error: 'Logs expired or not found',
						logs: completedSummary,
						status: run.status,
						html_url: run.html_url
					},
					{ status: 404 }
				);
			}
		} catch (innerError: any) {
			if (e.status === 401 || e.status === 403 || innerError?.status === 401 || innerError?.status === 403) {
				return json(
					{
						success: false,
						error:
							'GitHub authentication required or token permissions insufficient. Please sign in with GitHub or verify your token.'
					},
					{ status: 401 }
				);
			}

			console.error(`Failed to fetch logs for run ${run_id} in ${repo}:`, e.message);
			return json({ success: false, error: 'Logs expired or not found' }, { status: 404 });
		}
	}
}
