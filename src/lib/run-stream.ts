import type { Language, RunEvent } from './types.js';

/**
 * Reads the newline-delimited JSON a run answers with, one event at a time.
 *
 * Chunk boundaries land wherever the network puts them, which is neither where the events end nor
 * even between characters — so lines are reassembled through a buffer, and the decoder is left in
 * streaming mode so half a code point waits for its other half instead of arriving as a replacement
 * character in the middle of a solution's output.
 */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<RunEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			let newline = buffer.indexOf('\n');
			while (newline !== -1) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (line.length > 0) yield JSON.parse(line) as RunEvent;
				newline = buffer.indexOf('\n');
			}
		}

		// Every event is written with its newline, so anything still buffered here is an event that
		// was cut in half by a connection that dropped. There is nothing to be read from half a
		// line, and the caller learns what happened from the `done` that never arrived.
		buffer += decoder.decode();
	} finally {
		// Releases the lock as well, and resolves straight away on a stream that already ended.
		await reader.cancel().catch(() => {});
	}
}

/**
 * Runs the saved solution for a problem and hands each event to `emit` as it arrives.
 *
 * Resolves when the server says the run is over, and throws otherwise — including when the stream
 * simply stops, because partial output presented as a finished run reads exactly like a solution
 * that printed half its answer.
 */
export async function streamRun(
	request: { problemId: number; language: Language },
	emit: (event: RunEvent) => void
): Promise<void> {
	const res = await fetch('/api/run', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request)
	});

	// A status code here is one from before the run started; anything that goes wrong once it is
	// under way arrives as an `error` event, by which time the 200 is long since sent.
	if (!res.ok || !res.body) {
		const detail = (await res.json().catch(() => null)) as { message?: string } | null;
		throw new Error(detail?.message || `Server error: ${res.status}`);
	}

	let finished = false;
	for await (const event of readEvents(res.body)) {
		if (event.type === 'error') throw new Error(event.message);
		if (event.type === 'done') finished = true;
		else emit(event);
	}

	if (!finished) throw new Error('Lost the connection to the run');
}
