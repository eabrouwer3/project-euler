import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '$env/static/private';
import * as schema from '../../../drizzle/schema.js';

const client = postgres(DATABASE_URL);
export const db = drizzle(client, { schema });
