import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import { sendPushNotification } from '$lib/server/push';
import { env } from '$env/dynamic/private';

export async function POST(event) {
	const rawBody = await event.request.text();
	const signature = event.request.headers.get('x-hub-signature-256');

	// 1. Verify GitHub Webhook Signature
	const webhookSecret = env.WEBHOOK_SECRET;
	if (!webhookSecret) {
		console.error('WEBHOOK_SECRET is not configured.');
		return json({ error: 'Webhook secret missing' }, { status: 500 });
	}

	if (!signature) {
		return json({ error: 'No signature provided' }, { status: 401 });
	}

	const hmac = crypto.createHmac('sha256', webhookSecret);
	const digest = `sha256=${hmac.update(rawBody).digest('hex')}`;

	if (signature !== digest) {
		return json({ error: 'Invalid signature' }, { status: 401 });
	}

	// 2. Parse Payload
	const payload = JSON.parse(rawBody);
	
	// We only care about workflow_run events
	if (event.request.headers.get('x-github-event') !== 'workflow_run') {
		return json({ message: 'Event ignored' });
	}

	const { action, workflow_run, repository } = payload;

	// We only care about completed workflows that failed
	if (action === 'completed' && workflow_run && workflow_run.conclusion === 'failure') {
		const repoName = repository?.name;
		const workflowName = workflow_run.name;
		
		console.log(`[Webhook] Workflow ${workflowName} in ${repoName} failed! Triggering pushes...`);

		// Fetch all users who have subscribed
		const users = await kv.smembers('push_users');
		
		let sentCount = 0;
		for (const username of users) {
			const subStrings = await kv.smembers(`push_subscriptions:${username}`);
			for (const subStr of subStrings) {
				try {
					const subscription = JSON.parse(subStr as string);
					const pushPayload = JSON.stringify({
						title: 'Pipeline Failed! 🚨',
						body: `${repoName}: ${workflowName} has failed.`,
						url: `https://agent-ci-dashboard.vercel.app/repo/${repoName}`
					});

					const success = await sendPushNotification(subscription, pushPayload);
					
					// Clean up expired subscriptions
					if (!success) {
						await kv.srem(`push_subscriptions:${username}`, subStr);
					} else {
						sentCount++;
					}
				} catch (e) {
					console.error('Failed to send push to a subscription', e);
				}
			}
		}

		return json({ success: true, message: `Sent ${sentCount} notifications` });
	}

	return json({ message: 'Workflow run ignored (not a failure)' });
}
