import { SvelteKitAuth } from '@auth/sveltekit';
import GitHub from '@auth/sveltekit/providers/github';
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, AUTH_SECRET } from '$env/static/private';
import { db } from './db.js';
import { users } from '../../../drizzle/schema.js';

export const { handle, signIn, signOut } = SvelteKitAuth({
	secret: AUTH_SECRET,
	trustHost: true,
	providers: [
		GitHub({
			clientId: GITHUB_CLIENT_ID,
			clientSecret: GITHUB_CLIENT_SECRET
		})
	],
	callbacks: {
		async signIn({ user, account, profile }) {
			if (account?.provider !== 'github' || !profile) return false;

			const githubId = String(profile.id);
			await db
				.insert(users)
				.values({
					githubId,
					username: profile.login as string,
					email: user.email ?? null,
					avatarUrl: user.image ?? null
				})
				.onConflictDoUpdate({
					target: users.githubId,
					set: {
						username: profile.login as string,
						email: user.email ?? null,
						avatarUrl: user.image ?? null
					}
				});

			return true;
		},
		async jwt({ token, profile }) {
			if (profile) {
				// First sign-in: enrich token with DB user id
				const result = await db.query.users.findFirst({
					where: (u, { eq }) => eq(u.githubId, String(profile.id))
				});
				if (result) {
					token.userId = result.id;
					token.username = result.username;
					token.avatarUrl = result.avatarUrl;
				}
			}
			return token;
		},
		async session({ session, token }) {
			if (token.userId) {
				session.user.id = token.userId as string;
				session.user.name = token.username as string;
				session.user.image = token.avatarUrl as string | undefined;
			}
			return session;
		}
	}
});
