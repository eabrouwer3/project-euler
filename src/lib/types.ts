export type Language = 'python' | 'typescript' | 'clojure';

export type SolutionStatus = 'in_progress' | 'solved';

export type SolutionSummary = {
	problemId: number;
	language: Language;
	status: SolutionStatus;
};

export type Problem = {
	id: number;
	title: string;
	published: Date;
	solvedBy: number;
};
