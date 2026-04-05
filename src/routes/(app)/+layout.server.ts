import { redirect } from '@sveltejs/kit';
import { getAllProblems } from '$lib/server/problems.js';
import { db } from '$lib/server/db.js';
import { solutions } from '../../../drizzle/schema.js';
import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async (event) => {
	const [session, problems] = await Promise.all([event.locals.auth(), getAllProblems()]);
	if (!session) redirect(302, '/login');

	const solutionSummaries = await db
		.select({ problemId: solutions.problemId, language: solutions.language, status: solutions.status })
		.from(solutions)
		.where(eq(solutions.userId, session.user.id));

	return { session, problems, solutionSummaries };
};
