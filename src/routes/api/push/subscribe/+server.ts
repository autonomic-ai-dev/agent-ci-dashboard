import { json } from '@sveltejs/kit';
import { kv } from '@vercel/kv';

export async function POST(event) {
	let session = null;
	try {
		session = await event.locals.auth();
	} catch (e) {
		// AUTH_URL not configured — fall back to GITHUB_TOKEN
	}
	if (!session) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const data = await event.request.json();
		const { subscription } = data;

		if (!subscription || !subscription.endpoint) {
			return json({ success: false, error: 'Invalid subscription object' }, { status: 400 });
		}

		const username = session?.user?.name || session?.user?.email || 'unknown_user';
		const key = `push_subscriptions:${username}`;

		// We store subscriptions in a Vercel KV Set or List.
		// A Redis List is easier: push to list, then we can read all.
		// Alternatively, we use SADD to prevent duplicates (since subscriptions are JSON, we stringify).
		await kv.sadd(key, JSON.stringify(subscription));

		// Also maintain a global set of all users who have subscriptions,
		// so the webhook knows who to notify (since the webhook isn't tied to a specific user context).
		await kv.sadd('push_users', username);

		return json({ success: true, message: 'Subscription saved' });
	} catch (error: any) {
		console.error('Failed to save push subscription:', error);
		return json({ success: false, error: 'Failed to save subscription' }, { status: 500 });
	}
}
