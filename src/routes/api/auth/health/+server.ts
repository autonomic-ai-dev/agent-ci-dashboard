import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function readAuthEnv() {
	return {
		secret: env.AUTH_SECRET ?? process.env.AUTH_SECRET ?? '',
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

/** Non-secret auth config probe for production debugging. */
export const GET: RequestHandler = async () => {
	const { secret, clientId, clientSecret } = readAuthEnv();

	return json({
		ok: secret.length > 0 && clientId.length > 0 && clientSecret.length > 0,
		authSecretLen: secret.length,
		githubClientIdLen: clientId.length,
		githubClientSecretLen: clientSecret.length,
		authUrl: env.AUTH_URL ?? process.env.AUTH_URL ?? null,
		vercelEnv: process.env.VERCEL_ENV ?? null,
		dynamicEnvSecretLen: (env.AUTH_SECRET ?? '').length,
		processEnvSecretLen: (process.env.AUTH_SECRET ?? '').length
	});
};
