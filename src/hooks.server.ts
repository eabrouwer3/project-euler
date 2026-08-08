import { sequence } from '@sveltejs/kit/hooks';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '$lib/server/db.js';
import { handle as authHandle } from '$lib/server/auth.js';
import { ensureCheckpoint } from '$lib/server/sandbox.js';
import type { Handle } from '@sveltejs/kit';

export const init = async () => {
	await migrate(db, { migrationsFolder: 'drizzle/migrations' });

	// Not awaited: building the toolchain checkpoint takes ~45s the first time a template
	// changes, and the site does not need it to serve anything but a code run. Warming it here
	// means the first submission after a deploy waits ~2s to boot a sandbox instead of ~45s to
	// build the template. Failures are logged and retried by the first run that needs it.
	void ensureCheckpoint().catch((err) =>
		console.error(`sandbox checkpoint warm-up failed, will retry on first run: ${err}`)
	);
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
