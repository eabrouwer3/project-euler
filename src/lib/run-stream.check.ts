/**
 * A run arrives as newline-delimited JSON over however many chunks the network felt like, and the
 * reader has to put the events back together. Nothing about where those boundaries fall is under
 * this app's control, so the assertions here drive the same stream at every chunk size there is —
 * including one byte, which splits both the lines and the characters inside them.
 */
import { readEvents } from './run-stream.js';
import type { RunEvent } from './types.js';

function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`FAIL: ${message}`);
		process.exit(1);
	}
}

/** The stream a server would write for these events, handed over `chunkSize` bytes at a time. */
function streamOf(text: string, chunkSize: number): ReadableStream<Uint8Array> {
	const bytes = new TextEncoder().encode(text);
	let offset = 0;

	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (offset >= bytes.length) {
				controller.close();
				return;
			}
			controller.enqueue(bytes.slice(offset, offset + chunkSize));
			offset += chunkSize;
		}
	});
}

async function collect(text: string, chunkSize: number): Promise<RunEvent[]> {
	const events: RunEvent[] = [];
	for await (const event of readEvents(streamOf(text, chunkSize))) events.push(event);
	return events;
}

const events: RunEvent[] = [
	{ type: 'started' },
	// Non-ASCII on purpose: a solution prints what it likes, and a code point split across two
	// chunks must not surface as a replacement character in the middle of its output.
	{ type: 'stdout', text: 'héllo → 世界\n' },
	{ type: 'stderr', text: 'Traceback (most recent call last):\n' },
	{ type: 'reset' },
	{ type: 'stdout', text: 'answer: 233168\n' },
	{ type: 'done' }
];
const wire = events.map((event) => `${JSON.stringify(event)}\n`).join('');
const expected = JSON.stringify(events);

// Every chunk size from a byte at a time to the whole stream at once, plus the sizes either side.
for (const chunkSize of [1, 2, 3, 5, 7, 13, 64, wire.length - 1, wire.length, wire.length + 1]) {
	const got = await collect(wire, chunkSize);
	assert(
		JSON.stringify(got) === expected,
		`chunk size ${chunkSize} did not reassemble the stream: ${JSON.stringify(got)}`
	);
}

// A blank line is not an event, and writing one must not end the stream or throw.
const padded = await collect(`\n${wire}\n\n`, 3);
assert(JSON.stringify(padded) === expected, `blank lines were not skipped: ${JSON.stringify(padded)}`);

// A connection that drops mid-event keeps everything that arrived whole before it. The reader
// reports nothing about the half-line; the caller sees a stream that ended without its `done`.
const cut = await collect(wire.slice(0, wire.length - 12), 5);
assert(
	JSON.stringify(cut) === JSON.stringify(events.slice(0, -1)),
	`a truncated stream lost complete events: ${JSON.stringify(cut)}`
);

// A run that printed nothing at all is a stream with no events in it, not an error.
assert((await collect('', 4)).length === 0, 'an empty stream should yield no events');

console.log('PASS: run-stream assertions hold');
