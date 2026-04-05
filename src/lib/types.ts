export type Language = 'python' | 'typescript' | 'clojure';

export type Problem = {
	id: number;
	title: string;
	published: Date;
	solvedBy: number;
};
