import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

let vapidConfigured = false;

function ensureVapid(): boolean {
	if (vapidConfigured) {
		return true;
	}

	const publicKey = publicEnv.PUBLIC_VAPID_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;
	const subject = 'mailto:admin@agent-ci.app';

	if (!publicKey || !privateKey) {
		return false;
	}

	try {
		webpush.setVapidDetails(subject, publicKey, privateKey);
		vapidConfigured = true;
		return true;
	} catch (err) {
		console.warn('VAPID configuration failed (invalid key format):', err);
		return false;
	}
}

export async function sendPushNotification(
	subscription: webpush.PushSubscription,
	payload: string
) {
	if (!ensureVapid()) {
		console.warn('Cannot send push notification: VAPID keys not configured or invalid.');
		return false;
	}

	try {
		await webpush.sendNotification(subscription, payload);
		return true;
	} catch (err: any) {
		console.error('Error sending push notification:', err);
		if (err.statusCode === 410 || err.statusCode === 404) {
			return false;
		}
		throw err;
	}
}
