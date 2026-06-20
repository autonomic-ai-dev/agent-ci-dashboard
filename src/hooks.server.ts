import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/sveltekit/providers/github';
import { env } from '$env/dynamic/private';

function authEnv() {
	return {
		secret:
			env.AUTH_SECRET ??
			process.env.AUTH_SECRET ??
			process.env.AUTH_SECRET_1 ??
			'',
		clientId:
			env.GITHUB_CLIENT_ID ??
			process.env.GITHUB_CLIENT_ID ??
			env.AUTH_GITHUB_ID ??
			process.env.AUTH_GITHUB_ID ??
			'',
		clientSecret:
			env.GITHUB_CLIENT_SECRET ??
			process.env.GITHUB_CLIENT_SECRET ??
			env.AUTH_GITHUB_SECRET ??
			process.env.AUTH_GITHUB_SECRET ??
			''
	};
}

// Resolve auth config per request so Vercel runtime env vars are visible.
// @ts-expect-error Auth.js SvelteKit callback typings are narrower than runtime allows
export const { handle, signIn, signOut } = SvelteKitAuth(() => {
	const { secret, clientId, clientSecret } = authEnv();

	return {
		trustHost: true,
		secret,
		providers: [
			GitHub({
				clientId,
				clientSecret,
				authorization: { params: { scope: 'read:user user:email repo workflow' } }
			})
		],
		callbacks: {
			async jwt({ token, account }: { token: Record<string, unknown>; account?: { access_token?: string } }) {
				if (account) {
					token.accessToken = account.access_token;
				}
				return token;
			},
			async session({
				session,
				token
			}: {
				session: Record<string, unknown>;
				token: Record<string, unknown>;
			}) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				session.accessToken = token.accessToken;
				return session;
			}
		}
	};
});
