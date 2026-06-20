export async function load({ fetch }) {
	const res = await fetch('/api/status');
	if (!res.ok) {
		return { statuses: [], error: 'Failed to load statuses' };
	}
	const json = await res.json();
	return {
		statuses: json.data || [],
		error: null
	};
}
