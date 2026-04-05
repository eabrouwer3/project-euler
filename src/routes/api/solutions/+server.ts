import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { solutions } from '../../../../drizzle/schema.js';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';
import type { Language, SolutionStatus } from '$lib/types.js';

export const GET: RequestHandler = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.id) error(401, 'Unauthorized');

	const problemId = parseInt(event.url.searchParams.get('problemId') ?? '', 10);
	const language = event.url.searchParams.get('language') as Language | null;
	if (isNaN(problemId) || !language) error(400, 'Missing problemId or language');

	const result = await db
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

	return json(result[0] ?? null);
};

export const POST: RequestHandler = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.id) error(401, 'Unauthorized');

	const body = await event.request.json();
	const { problemId, language, code, packages = [] } = body as {
		problemId: number;
		language: Language;
		code: string;
		packages?: string[];
	};

	if (!problemId || !language || code === undefined) error(400, 'Missing required fields');

	await db
		.insert(solutions)
		.values({
			userId: session.user.id,
			problemId,
			language,
			code,
			packages,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: [solutions.userId, solutions.problemId, solutions.language],
			set: { code, packages, updatedAt: new Date() }
		});

	return json({ ok: true });
};

export const PATCH: RequestHandler = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.id) error(401, 'Unauthorized');

	const { problemId, language, status } = (await event.request.json()) as {
		problemId: number;
		language: Language;
		status: SolutionStatus;
	};
	if (!problemId || !language || !status) error(400, 'Missing required fields');

	await db
		.update(solutions)
		.set({ status, updatedAt: new Date() })
		.where(
			and(
				eq(solutions.userId, session.user.id),
				eq(solutions.problemId, problemId),
				eq(solutions.language, language)
			)
		);

	return json({ ok: true });
};
