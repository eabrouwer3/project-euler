import type { Problem, ProblemAttachment } from '$lib/types.js';
import { difficultyOf } from './difficulty.js';

const SITE = 'https://projecteuler.net/';

type ProblemCache = { data: Problem[]; ts: number };
let problemCache: ProblemCache | null = null;

/**
 * Holds the in-flight fetch rather than its result: a page load asks for the description and
 * its attachment list at once, and both come out of the same body.
 */
const HTML_CACHE = new Map<number, Promise<string>>();
const ONE_HOUR = 3_600_000;

export async function getAllProblems(): Promise<Problem[]> {
	if (problemCache && Date.now() - problemCache.ts < ONE_HOUR) {
		return problemCache.data;
	}

	const res = await fetch(`${SITE}minimal=problems`);
	const text = await res.text();
	const rows = text.split('\n').slice(1).filter(Boolean);

	const data = rows
		.map((str) => {
			const [id, title, published, solvedBy] = str.split('##');
			const problemId = parseInt(id, 10);
			return {
				id: problemId,
				title,
				published: new Date(parseInt(published, 10) * 1000),
				solvedBy: parseInt(solvedBy, 10),
				// The list feed does not carry the rating, so it comes from the checked-in snapshot.
				difficulty: difficultyOf(problemId)
			} satisfies Problem;
		})
		.filter((p) => !isNaN(p.id))
		.sort((a, b) => a.id - b.id);

	problemCache = { data, ts: Date.now() };
	return data;
}

/** Anything already resolvable on its own: another site, a root path, a fragment, a data URI. */
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

/**
 * Problem descriptions link everything relative to projecteuler.net's own document root —
 * `resources/images/0015.png` for the grid in problem 15, `resources/documents/0022_names.txt`
 * for the name list, `problem=18` for a prerequisite. Served from our origin those resolve
 * against our routes and 404, which is why problem 15 rendered with a broken image: the old
 * rewrite only knew the `project/` prefix the site used before its 2023 redesign, so nothing
 * matched and every relative URL was left as-is.
 *
 * Cross-references to other problems are pointed at our own page for them rather than sending
 * the reader off-site; everything else keeps its meaning by becoming an absolute site URL.
 */
export function resolveLinks(html: string): string {
	return html
		.replace(/\b(src|href)="([^"]*)"/gi, (whole, attribute: string, url: string) => {
			if (ABSOLUTE.test(url)) return whole;

			const crossReference = /^problem=(\d+)$/.exec(url);
			if (crossReference) return `${attribute}="/problem/${crossReference[1]}"`;

			return `${attribute}="${SITE}${url.replace(/^\.\//, '')}"`;
		})
		// The description renders inside the app shell, so a link that leaves the site must not
		// take the editor with it.
		.replace(
			new RegExp(`<a href="${SITE}`, 'g'),
			`<a target="_blank" rel="noopener noreferrer" href="${SITE}`
		);
}

function getRawProblemHtml(n: number): Promise<string> {
	let pending = HTML_CACHE.get(n);
	if (pending) return pending;

	pending = (async () => {
		const res = await fetch(`${SITE}minimal=${n}`);
		if (!res.ok) throw new Error(`problem ${n}: HTTP ${res.status}`);
		return res.text();
	})().catch((err) => {
		// A failed fetch must not be cached as this problem's description forever.
		HTML_CACHE.delete(n);
		throw err;
	});

	HTML_CACHE.set(n, pending);
	return pending;
}

export async function getProblemHtml(n: number): Promise<string> {
	return resolveLinks(await getRawProblemHtml(n));
}

const DOCUMENT_LINK = /<a\s+href="(resources\/documents\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;

/** Link text is only a filename when it looks like one; problem 89's links to a glossary do not. */
const FILENAME = /^[\w.-]+\.[a-z0-9]+$/i;

/**
 * The data files a problem hands out — problem 22's `names.txt`, problem 67's `triangle.txt`.
 *
 * They are stored prefixed by problem number (`0022_names.txt`) but written about by the bare
 * name, and the two do not always agree: problem 59's link text is the prefixed name while
 * problem 22's is not. Rather than pick one convention and make half the problems wrong, the
 * file lands under the name the problem itself uses and every other spelling becomes a symlink
 * to it, so `open('names.txt')` and `open('0022_names.txt')` both work.
 */
export function parseAttachments(html: string): ProblemAttachment[] {
	const attachments: ProblemAttachment[] = [];
	const seen = new Set<string>();

	for (const [, path, linkText] of html.matchAll(DOCUMENT_LINK)) {
		const url = `${SITE}${path}`;
		if (seen.has(url)) continue;
		seen.add(url);

		const basename = path.slice(path.lastIndexOf('/') + 1).replace(/[?#].*$/, '');
		const unprefixed = basename.replace(/^\d+_/, '');
		const label = linkText.trim();

		const name = FILENAME.test(label) ? label : unprefixed;
		const aliases = [...new Set([unprefixed, basename])].filter((alias) => alias !== name);

		attachments.push({ name, aliases, url });
	}

	return attachments;
}

export async function getProblemAttachments(n: number): Promise<ProblemAttachment[]> {
	return parseAttachments(await getRawProblemHtml(n));
}

/**
 * Comfortably above the largest file Project Euler ships (problem 22's, at 46K) and far below
 * anything that would be uncomfortable to splice into a shell command.
 */
const MAX_ATTACHMENT_BYTES = 1_048_576;

/**
 * Cached by URL and for the lifetime of the process: these files are static — the last-modified
 * dates are years old — and a run should never wait on projecteuler.net for one twice.
 */
const CONTENT_CACHE = new Map<string, Promise<string>>();

function fetchAttachment(url: string): Promise<string> {
	let pending = CONTENT_CACHE.get(url);
	if (pending) return pending;

	pending = (async () => {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const content = await res.text();
		if (content.length > MAX_ATTACHMENT_BYTES) {
			throw new Error(`${content.length} bytes exceeds the ${MAX_ATTACHMENT_BYTES} byte limit`);
		}
		// Every one of these is plain text, and the run script carries them as shell heredocs,
		// which cannot survive a NUL. Refusing beats writing a silently truncated file.
		if (content.includes('\0')) throw new Error('not a text file');

		return content;
	})().catch((err) => {
		// A transient fetch failure must not be the permanent answer for this file.
		CONTENT_CACHE.delete(url);
		throw err;
	});

	CONTENT_CACHE.set(url, pending);
	return pending;
}

export type LoadedAttachment = ProblemAttachment & { content: string };

/**
 * Fetches every data file a problem provides. A file that cannot be fetched is reported rather
 * than thrown: the solution still runs, and the run can say which file is missing, which is far
 * more useful than the language's own "no such file" from inside the sandbox.
 */
export async function loadProblemAttachments(
	n: number
): Promise<{ attachments: LoadedAttachment[]; missing: string[] }> {
	const wanted = await getProblemAttachments(n);
	const attachments: LoadedAttachment[] = [];
	const missing: string[] = [];

	const results = await Promise.allSettled(wanted.map((a) => fetchAttachment(a.url)));
	results.forEach((result, i) => {
		if (result.status === 'fulfilled') {
			attachments.push({ ...wanted[i], content: result.value });
		} else {
			console.error(`attachment ${wanted[i].url} unavailable: ${result.reason}`);
			missing.push(wanted[i].name);
		}
	});

	return { attachments, missing };
}

/**
 * Warms the attachment cache while the problem is being read, so the first run does not spend
 * a round trip to projecteuler.net fetching a file it could already have. Fire-and-forget for
 * the same reason the sandbox warm-up is: the run path fetches its own if this never landed.
 */
export function prefetchProblemAttachments(n: number): void {
	void loadProblemAttachments(n).catch(() => {});
}
