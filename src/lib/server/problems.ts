import type { Problem } from '$lib/types.js';

type ProblemCache = { data: Problem[]; ts: number };
let problemCache: ProblemCache | null = null;

const HTML_CACHE = new Map<number, string>();
const ONE_HOUR = 3_600_000;

export async function getAllProblems(): Promise<Problem[]> {
	if (problemCache && Date.now() - problemCache.ts < ONE_HOUR) {
		return problemCache.data;
	}

	const res = await fetch('https://projecteuler.net/minimal=problems');
	const text = await res.text();
	const rows = text.split('\n').slice(1).filter(Boolean);

	const data = rows
		.map((str) => {
			const [id, title, published, solvedBy] = str.split('##');
			return {
				id: parseInt(id, 10),
				title,
				published: new Date(parseInt(published, 10) * 1000),
				solvedBy: parseInt(solvedBy, 10)
			} satisfies Problem;
		})
		.filter((p) => !isNaN(p.id))
		.sort((a, b) => a.id - b.id);

	problemCache = { data, ts: Date.now() };
	return data;
}

export async function getProblemHtml(n: number): Promise<string> {
	if (HTML_CACHE.has(n)) return HTML_CACHE.get(n)!;

	const res = await fetch(`https://projecteuler.net/minimal=${n}`);
	const html = (await res.text()).replace(
		/src="project\//g,
		'src="https://projecteuler.net/project/'
	);

	HTML_CACHE.set(n, html);
	return html;
}
