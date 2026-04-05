import { error, redirect } from '@sveltejs/kit';
import { getProblemHtml } from '$lib/server/problems.js';
import { db } from '$lib/server/db.js';
import { solutions } from '../../../../../../drizzle/schema.js';
import { and, eq } from 'drizzle-orm';
import { LANGUAGES, BOILERPLATE } from '$lib/constants.js';
import type { PageServerLoad } from './$types.js';
import type { Language } from '$lib/types.js';

export const load: PageServerLoad = async (event) => {
	const problemId = parseInt(event.params.id, 10);
	if (isNaN(problemId) || problemId < 1) error(404, 'Problem not found');

	const language = event.params.language as Language;
	if (!LANGUAGES.includes(language)) redirect(302, `/problem/${event.params.id}/python`);

	const session = await event.locals.auth();

	const [problemHtml, savedSolution] = await Promise.all([
		getProblemHtml(problemId),
		session?.user?.id
			? db
					.select()
					.from(solutions)
					.where(
						and(
							eq(solutions.userId, session.user.id),
							eq(solutions.problemId, problemId),
							eq(solutions.language, language)
						)
					)
					.limit(1)
					.then((rows) => rows[0] ?? null)
			: Promise.resolve(null)
	]);

	return {
		problemId,
		language,
		problemHtml,
		code: savedSolution?.code ?? BOILERPLATE[language],
		packages: (savedSolution?.packages as string[]) ?? []
	};
};
