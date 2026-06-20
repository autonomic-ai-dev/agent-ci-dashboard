/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Precache assets injected by Workbox during build
precacheAndRoute(self.__WB_MANIFEST || []);

// Listen for incoming Push Events
self.addEventListener('push', (event) => {
	if (!event.data) return;

	let data;
	try {
		data = event.data.json();
	} catch (e) {
		data = { title: 'Notification', body: event.data.text() };
	}

	const title = data.title || 'Agent CI Dashboard';
	const options = {
		body: data.body || 'You have a new update.',
		icon: '/pwa-192x192.png',
		badge: '/pwa-192x192.png',
		data: {
			url: data.url || '/'
		}
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

// Handle clicking on the push notification
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const urlToOpen = event.notification.data.url;

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
			// Check if there is already a window/tab open with the target URL
			for (let i = 0; i < windowClients.length; i++) {
				const client = windowClients[i];
				if (client.url === urlToOpen && 'focus' in client) {
					return client.focus();
				}
			}
			// If not, open a new window/tab
			if (self.clients.openWindow) {
				return self.clients.openWindow(urlToOpen);
			}
		})
	);
});
