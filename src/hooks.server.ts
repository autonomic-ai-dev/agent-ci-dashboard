import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/sveltekit/providers/github';

export const { handle, signIn, signOut } = SvelteKitAuth({
	trustHost: true,
	secret: process.env.AUTH_SECRET,
	providers: [
		GitHub({
			clientId: process.env.GITHUB_CLIENT_ID ?? process.env.AUTH_GITHUB_ID,
			clientSecret: process.env.GITHUB_CLIENT_SECRET ?? process.env.AUTH_GITHUB_SECRET,
			authorization: { params: { scope: 'read:user user:email repo workflow' } }
		})
	],
	callbacks: {
		async jwt({ token, account }) {
			if (account) {
				token.accessToken = account.access_token;
			}
			return token;
		},
		async session({ session, token }) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			session.accessToken = token.accessToken;
			return session;
		}
	}
});
