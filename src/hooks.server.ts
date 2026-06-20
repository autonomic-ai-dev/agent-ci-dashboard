import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/sveltekit/providers/github';
import { env } from '$env/dynamic/private';

export const { handle, signIn, signOut } = SvelteKitAuth((_event) => {
	// Resolve at request time — module-level $env/dynamic/private reads are empty on Vercel serverless.
	const secret =
		env.AUTH_SECRET ?? process.env.AUTH_SECRET ?? process.env.AUTH_SECRET_1;
	const clientId =
		env.GITHUB_CLIENT_ID ??
		process.env.GITHUB_CLIENT_ID ??
		process.env.AUTH_GITHUB_ID;
	const clientSecret =
		env.GITHUB_CLIENT_SECRET ??
		process.env.GITHUB_CLIENT_SECRET ??
		process.env.AUTH_GITHUB_SECRET;

	if (!secret || !clientId || !clientSecret) {
		const missing = [
			!secret && 'AUTH_SECRET',
			!clientId && 'GITHUB_CLIENT_ID (or AUTH_GITHUB_ID)',
			!clientSecret && 'GITHUB_CLIENT_SECRET (or AUTH_GITHUB_SECRET)'
		].filter(Boolean);
		throw new Error(`Auth.js missing env: ${missing.join(', ')}`);
	}

	return {
		trustHost: true,
		basePath: '/auth',
		secret,
		providers: [
			GitHub({
				clientId,
				clientSecret,
				authorization: { params: { scope: 'read:user user:email repo workflow' } }
			})
		],
		callbacks: {
			async jwt({ token, account }: { token: any; account?: any }) {
				if (account) {
					token.accessToken = account.access_token;
				}
				return token;
			},
			async session({ session, token }: { session: any; token: any }) {
				session.accessToken = token.accessToken;
				return session;
			}
		}
	};
});
