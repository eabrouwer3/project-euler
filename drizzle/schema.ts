import { pgTable, uuid, text, integer, timestamp, jsonb, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	githubId: text('github_id').unique().notNull(),
	username: text('username').notNull(),
	email: text('email'),
	avatarUrl: text('avatar_url'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const solutions = pgTable(
	'solutions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.references(() => users.id)
			.notNull(),
		problemId: integer('problem_id').notNull(),
		language: text('language').notNull(),
		code: text('code').notNull().default(''),
		packages: jsonb('packages').$type<string[]>().notNull().default([]),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		unique().on(t.userId, t.problemId, t.language),
		check('language_check', sql`${t.language} IN ('python', 'typescript', 'clojure')`)
	]
);

export type User = typeof users.$inferSelect;
export type Solution = typeof solutions.$inferSelect;
