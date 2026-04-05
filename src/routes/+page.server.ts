import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session) redirect(302, '/login');
	redirect(302, '/problem/1');
};
