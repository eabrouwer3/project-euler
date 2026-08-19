export type Language = 'python' | 'typescript' | 'ruby' | 'clojure' | 'rust' | 'cpp' | 'assembly';

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
 * One line of a run's stream. `POST /api/run` answers in newline-delimited JSON rather than with
 * a single object at the end, so a solution's output reaches the reader while it is still running
 * — which is the whole point of a minute-long deadline that returns what it printed.
 *
 * `started` carries nothing and is sent as soon as the run is dispatched: it puts a first byte on
 * the wire, so the response headers reach the reader instead of waiting behind a solution that
 * may print nothing for a minute. `reset` retracts everything streamed before it, which happens
 * when the sandbox turned out to be gone and the run began again on a fresh one.
 */
export type RunEvent =
	| { type: 'started' }
	| { type: 'stdout'; text: string }
	| { type: 'stderr'; text: string }
	| { type: 'reset' }
	| { type: 'error'; message: string }
	| { type: 'done' };

export type Problem = {
	id: number;
	title: string;
	published: Date;
	solvedBy: number;
};
