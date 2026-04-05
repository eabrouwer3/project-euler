import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { solutions } from '../../../../drizzle/schema.js';
import { and, eq } from 'drizzle-orm';
import { runCode } from '$lib/server/docker.js';
import { BOILERPLATE } from '$lib/constants.js';
import type { RequestHandler } from './$types.js';
import type { Language } from '$lib/types.js';

export const POST: RequestHandler = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.id) error(401, 'Unauthorized');

	const { problemId, language } = (await event.request.json()) as {
		problemId: number;
		language: Language;
	};

	if (!problemId || !language) error(400, 'Missing required fields');

	const saved = await db
		.select()
		.from(solutions)
		.where(
			and(
				eq(solutions.userId, session.user.id),
				eq(solutions.problemId, problemId),
				eq(solutions.language, language)
			)
		)
		.limit(1);

	const runCodeStr = saved[0]?.code ?? BOILERPLATE[language];
	const runPackages = (saved[0]?.packages as string[]) ?? [];

	try {
		const result = await runCode(language, runCodeStr, runPackages);
		return json(result);
	} catch (err) {
		return json({ stdout: '', stderr: String(err) }, { status: 500 });
	}
};
