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

export type Problem = {
	id: number;
	title: string;
	published: Date;
	solvedBy: number;
};
