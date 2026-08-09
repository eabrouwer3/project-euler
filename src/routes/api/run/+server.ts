import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { solutions } from '../../../../drizzle/schema.js';
import { and, eq } from 'drizzle-orm';
import { runCode } from '$lib/server/run-code.js';
import { BOILERPLATE } from '$lib/constants.js';
import type { RequestHandler } from './$types.js';
import type { Language, RunEvent } from '$lib/types.js';

/**
 * Runs a saved solution and streams what it prints, as newline-delimited JSON.
 *
 * Everything that can be checked before the run is checked while a status code still means
 * something; once the first event is on the wire the response is committed to 200, so a run that
 * fails after that says so in an `error` event instead. That is the trade for streaming at all,
 * and it costs nothing here — the reader is this app's own output panel, which shows the message
 * either way.
 */
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
	const userId = session.user.id;

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			// A reader that has gone away closes the stream under us, and enqueueing into a closed
			// controller throws. The run itself is unaffected — it is already in a sandbox with its
			// own deadline — so the only thing to do is stop writing and let it finish.
			let open = true;
			const emit = (payload: RunEvent) => {
				if (!open) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
				} catch {
					open = false;
				}
			};

			try {
				await runCode(userId, problemId, language, runCodeStr, runPackages, emit);
				emit({ type: 'done' });
			} catch (err) {
				console.error(`run failed for ${userId} on problem ${problemId}: ${err}`);
				emit({ type: 'error', message: String(err) });
			} finally {
				open = false;
				try {
					controller.close();
				} catch {
					// Already closed by a reader that left.
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-store',
			// Nothing in front of this app buffers responses today, but a run that prints early and
			// then thinks for a minute is exactly what a buffering proxy would hold onto.
			'X-Accel-Buffering': 'no'
		}
	});
};
