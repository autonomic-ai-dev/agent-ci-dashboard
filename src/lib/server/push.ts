import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const publicKey = publicEnv.PUBLIC_VAPID_KEY;
const privateKey = env.VAPID_PRIVATE_KEY;
const subject = 'mailto:admin@agent-ci.app';

if (publicKey && privateKey) {
	webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
	console.warn('VAPID keys are missing from environment variables. Web Push will not work.');
}

export async function sendPushNotification(subscription: webpush.PushSubscription, payload: string) {
	if (!publicKey || !privateKey) {
		console.error('Cannot send push notification: VAPID keys missing.');
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
