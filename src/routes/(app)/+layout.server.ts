import { redirect } from '@sveltejs/kit';
import { getAllProblems } from '$lib/server/problems.js';
import { db } from '$lib/server/db.js';
import { solutions } from '../../../drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { BOILERPLATE } from '$lib/constants.js';
import type { LayoutServerLoad } from './$types.js';
import type { Language } from '$lib/types.js';

export const load: LayoutServerLoad = async (event) => {
	const [session, problems] = await Promise.all([event.locals.auth(), getAllProblems()]);
	if (!session) redirect(302, '/login');

	const rows = await db
		.select({ problemId: solutions.problemId, language: solutions.language, status: solutions.status, code: solutions.code })
		.from(solutions)
		.where(eq(solutions.userId, session.user.id));

	// Only show a chip if code has been modified from boilerplate, or explicitly solved
	const solutionSummaries = rows
		.filter((s) => s.code !== BOILERPLATE[s.language as Language] || s.status === 'solved')
		.map(({ code: _code, ...rest }) => rest);

	return { session, problems, solutionSummaries };
};
