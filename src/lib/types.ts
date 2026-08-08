export type Language = 'python' | 'typescript' | 'clojure' | 'rust' | 'cpp' | 'assembly';

export type SolutionStatus = 'in_progress' | 'solved';

export type SolutionSummary = {
	problemId: number;
	language: Language;
	status: SolutionStatus;
};

/**
 * A data file a problem hands out. `name` is what it is called in the run's working directory,
 * `aliases` are the other spellings of it that are symlinked alongside.
 */
export type ProblemAttachment = {
	name: string;
	aliases: string[];
	url: string;
};

/**
 * How hard Project Euler rates a problem. The two numbers are the same measure: `percent` is the
 * rating the site computes, `level` the band it falls in — both are shown as `Level 5 [13%]` on
 * the problem's own page.
 */
export type ProblemDifficulty = {
	level: number;
	percent: number;
};

export type Problem = {
	id: number;
	title: string;
	published: Date;
	solvedBy: number;
	/** Absent until enough members have solved the problem for a rating to be published. */
	difficulty?: ProblemDifficulty;
};
