export async function load({ fetch }) {
	try {
		const res = await fetch('/api/status');
		if (!res.ok) {
			return { statuses: [], error: 'Failed to load statuses' };
		}
		const json = await res.json();
		return {
			statuses: json.success && json.data ? json.data : [],
			error: json.success ? null : 'Failed to parse'
		};
	} catch (e) {
		return { statuses: [], error: 'Network error' };
	}
}
