import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { solutions } from '../../../../../drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.id) error(401, 'Unauthorized');

	const userSolutions = await db
		.select({
			problemId: solutions.problemId,
			language: solutions.language,
			code: solutions.code,
			packages: solutions.packages,
			status: solutions.status
		})
		.from(solutions)
		.where(eq(solutions.userId, session.user.id));

	const json = JSON.stringify(userSolutions, null, 2);
	const zip = zipSync({ 'solutions.json': strToU8(json) });

	return new Response(zip, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': 'attachment; filename="euler-solutions.zip"'
		}
	});
};
