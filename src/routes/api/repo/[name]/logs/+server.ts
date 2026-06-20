import { json } from '@sveltejs/kit';
import { Octokit } from 'octokit';
import { env } from '$env/dynamic/private';
import AdmZip from 'adm-zip';

const GITHUB_OWNER = 'autonomic-ai-dev';

export async function GET(event) {
	const { params, url, setHeaders } = event;
	const session = await event.locals.auth();
	// @ts-ignore
	const token = session?.accessToken || env.GITHUB_TOKEN;

	// Cache logs heavily, they rarely change after completion, but allow revalidation.
	setHeaders({
		'Cache-Control': 'max-age=120, s-maxage=120, stale-while-revalidate=300'
	});

	const repo = params.name;
	const runIdStr = url.searchParams.get('run_id');

	if (!repo || !runIdStr) {
		return json({ success: false, error: 'Missing run_id or repo' }, { status: 400 });
	}

	const run_id = parseInt(runIdStr, 10);
	if (isNaN(run_id)) {
		return json({ success: false, error: 'Invalid run_id' }, { status: 400 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		// GitHub returns a redirect to the actual zip file
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

		// A workflow log zip contains folders for each job, and inside are .txt files for each step
		// We will try to concatenate them in order. For simplicity, just grab everything.
		
		// Sort entries by name to preserve step order (e.g., 1_setup.txt, 2_build.txt)
		const textEntries = zipEntries.filter(e => e.entryName.endsWith('.txt')).sort((a, b) => a.entryName.localeCompare(b.entryName));
		
		if (textEntries.length === 0) {
			return json({ success: true, logs: 'No text logs found in archive.' });
		}

		for (const entry of textEntries) {
			const content = zip.readAsText(entry);
			// Optional: strip timestamps from the beginning of lines to make it cleaner?
			// GitHub log lines start with "2023-01-01T00:00:00.0000000Z "
			const cleanContent = content.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /gm, '');
			
			allLogs += `\n--- [${entry.entryName}] ---\n\n`;
			allLogs += cleanContent;
		}

		return json({ success: true, logs: allLogs });
	} catch (e: any) {
		console.error(`Failed to fetch logs for run ${run_id} in ${repo}:`, e.message);
		return json({ success: false, error: 'Logs expired or not found' }, { status: 404 });
	}
}
