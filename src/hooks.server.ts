import { sequence } from '@sveltejs/kit/hooks';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '$lib/server/db.js';
import { handle as authHandle } from '$lib/server/auth.js';
import type { Handle } from '@sveltejs/kit';

export const init = async () => {
	await migrate(db, { migrationsFolder: 'drizzle/migrations' });
};

const notFoundHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (response.status === 404) {
		const session = await event.locals.auth();
		const location = session ? '/problem/1' : '/login';
		return new Response(null, { status: 302, headers: { location } });
	}
	return response;
};

export const handle = sequence(authHandle, notFoundHandle);
