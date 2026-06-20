import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/sveltekit/providers/github';
import { env } from '$env/dynamic/private';

export const { handle, signIn, signOut } = SvelteKitAuth({
	trustHost: true,
	basePath: '/auth',
	secret: env.AUTH_SECRET,
	providers: [
		GitHub({ 
			clientId: env.GITHUB_CLIENT_ID, 
			clientSecret: env.GITHUB_CLIENT_SECRET,
			// We need read:user user:email for Auth.js, and repo workflow for our app
			authorization: { params: { scope: 'read:user user:email repo workflow' } }
		})
	],
	callbacks: {
		async jwt({ token, account }) {
			// Persist the OAuth access_token to the token right after signin
			if (account) {
				token.accessToken = account.access_token;
			}
			return token;
		},
		async session({ session, token }) {
			// Send properties to the client, like an access_token from a provider.
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			session.accessToken = token.accessToken;
			return session;
		}
	}
});
