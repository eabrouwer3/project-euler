import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '$lib/server/db.js';

export const init = async () => {
	await migrate(db, { migrationsFolder: 'drizzle/migrations' });
};

export { handle } from '$lib/server/auth.js';
