import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { solutions } from '../../../../../drizzle/schema.js';
import { unzipSync, strFromU8 } from 'fflate';
import type { RequestHandler } from './$types.js';
import type { Language, SolutionStatus } from '$lib/types.js';

export const POST: RequestHandler = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.id) error(401, 'Unauthorized');

	const formData = await event.request.formData();
	const file = formData.get('file') as File | null;
	if (!file) error(400, 'No file provided');

	const buffer = new Uint8Array(await file.arrayBuffer());
	let unzipped: ReturnType<typeof unzipSync>;
	try {
		unzipped = unzipSync(buffer);
	} catch {
		error(400, 'Invalid zip file');
	}

	const jsonFile = unzipped['solutions.json'];
	if (!jsonFile) error(400, 'solutions.json not found in zip');

	let data: { problemId: number; language: Language; code: string; packages: string[]; status: SolutionStatus }[];
	try {
		data = JSON.parse(strFromU8(jsonFile));
	} catch {
		error(400, 'Invalid solutions.json');
	}

	if (!Array.isArray(data)) error(400, 'solutions.json must be an array');

	for (const sol of data) {
		if (!sol.problemId || !sol.language) continue;
		await db
			.insert(solutions)
			.values({
				userId: session.user.id,
				problemId: sol.problemId,
				language: sol.language,
				code: sol.code ?? '',
				packages: sol.packages ?? [],
				status: sol.status ?? 'in_progress',
				updatedAt: new Date()
			})
			.onConflictDoUpdate({
				target: [solutions.userId, solutions.problemId, solutions.language],
				set: {
					code: sol.code ?? '',
					packages: sol.packages ?? [],
					status: sol.status ?? 'in_progress',
					updatedAt: new Date()
				}
			});
	}

	return json({ imported: data.length });
};
