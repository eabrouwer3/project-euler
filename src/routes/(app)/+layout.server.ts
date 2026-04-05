import { getAllProblems } from '$lib/server/problems.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async (event) => {
	const [session, problems] = await Promise.all([event.locals.auth(), getAllProblems()]);
	return { session, problems };
};
