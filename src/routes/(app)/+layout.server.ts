import { redirect } from '@sveltejs/kit';
import { getAllProblems } from '$lib/server/problems.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async (event) => {
	const [session, problems] = await Promise.all([event.locals.auth(), getAllProblems()]);
	if (!session) redirect(302, '/login');
	return { session, problems };
};
