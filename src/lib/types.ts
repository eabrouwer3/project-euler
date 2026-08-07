export type Language = 'python' | 'typescript' | 'clojure' | 'rust' | 'cpp' | 'assembly';

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
