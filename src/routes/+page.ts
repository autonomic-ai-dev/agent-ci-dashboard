let cachedStatuses: any[] = [];

export async function load({ fetch }) {
	try {
		const res = await fetch('/api/status');
		if (!res.ok) {
			return { statuses: cachedStatuses, error: 'Failed to load statuses' };
		}
		const json = await res.json();
		if (json.success && json.data) {
			cachedStatuses = json.data;
		}
		return {
			statuses: cachedStatuses,
			error: json.success ? null : 'Failed to parse'
		};
	} catch (e) {
		return { statuses: cachedStatuses, error: 'Network error' };
	}
}
