import type { ProblemDifficulty } from '$lib/types.js';
import { DIFFICULTY_RATINGS } from './difficulty-ratings.js';

/**
 * A problem page states its rating once, inside the tooltip beside the title:
 * `Difficulty: Level 5 [13%]`. Both numbers say the same thing — the level is a bucketing of the
 * percentage — but the site leads with the level, so both are kept and the UI can pick.
 */
const DIFFICULTY = /Difficulty:\s*Level\s*(\d+)\s*\[\s*(\d+)\s*%\s*\]/i;

/**
 * A problem is unrated until enough members have solved it, and its page then simply omits the
 * line rather than showing a zero, so "no rating" is a normal answer rather than a parse failure.
 */
export function parseDifficulty(html: string): ProblemDifficulty | null {
	const match = DIFFICULTY.exec(html);
	if (!match) return null;

	return { level: parseInt(match[1], 10), percent: parseInt(match[2], 10) };
}

/**
 * The rating for a problem, from the table checked in alongside this file.
 *
 * It is a snapshot rather than a live lookup because the rating is only published on the full
 * `problem=N` page: showing it for the whole list would otherwise mean a thousand requests to
 * projecteuler.net behind every cold page load. `bun run difficulty:sync` refreshes the snapshot.
 */
export function difficultyOf(problemId: number): ProblemDifficulty | undefined {
	const rating = DIFFICULTY_RATINGS[problemId];
	if (!rating) return undefined;

	return { level: rating[0], percent: rating[1] };
}
