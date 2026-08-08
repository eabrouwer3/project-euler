# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
bun install           # Install dependencies
bun run dev           # Start dev server
bun run build         # Build for production
bun run start         # Start production server (bun ./build/index.js)

# Database
bun run db:generate   # Generate Drizzle migrations after schema changes
bun run db:migrate    # Apply pending migrations

# Infrastructure
docker compose up -d  # Start PostgreSQL
```

Always run `mise use` before executing bun commands. This project runs on Bun,
not Node — do not use `npm`/`npx`, and do not create a `package-lock.json`
(`bun.lock` is the lockfile). The `dev`/`build`/`preview`/`db:*` scripts wrap
their tools in `bunx --bun` so they execute on the Bun runtime rather than
falling back to Node.

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — generate with `openssl rand -hex 32`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth app credentials
- `ORIGIN` — app origin URL (e.g. `http://localhost:5173`)

Docker Compose provides PostgreSQL at `localhost:5432` with default credentials `euler:euler`.

## Architecture

**Stack:** Bun (runtime + package manager), SvelteKit 2 + Svelte 5, TypeScript, Tailwind CSS 4, shadcn/ui (bits-ui), Drizzle ORM, PostgreSQL, Auth.js (GitHub OAuth), Monaco Editor, KaTeX, Railway Sandboxes for code execution.

**Runtime:** Everything runs on Bun, but the app deliberately keeps the
first-party `@sveltejs/adapter-node` rather than a Bun-specific adapter — its
`node:http` output runs fine under Bun (`bun ./build/index.js`), so there is no
reason to trade core-team maintenance for a community package at this traffic
level. Revisit only if you need `Bun.serve` natively (WebSockets, throughput).
`shared/` is a Bun workspace of the root package. There is no separate runner
service: solutions execute in Railway Sandboxes provisioned directly by the app,
so the only deployed services are the app and Postgres.

**Routing layout groups:**
- `(app)/` — main app shell with sidebar navigation; requires auth
- `(auth)/` — login page

**Core data flow:**
1. Problem list and descriptions are fetched from `projecteuler.net/minimal=*` and cached in-memory for 1 hour
2. User solutions are stored in PostgreSQL (one row per user + problem + language)
3. Code execution: `POST /api/run` provisions a **Railway Sandbox** (a per-submission VM) from a toolchain checkpoint, writes the solution into it, runs one command with a 30s timeout, and destroys it; supports Python, TypeScript (Bun), Clojure, Rust, C++, and x86-64 assembly (GNU as)

**Key directories:**
- `src/lib/server/` — auth, DB client, code execution, problem fetching
- `src/lib/server/sandbox.ts` — the sandbox layer: toolchain template, checkpoint lifecycle, and running one command in a throwaway VM
- `src/lib/server/run-code.ts` — maps a language and its packages to the files and command that produce the solution's output
- `src/lib/components/` — Svelte UI components (CodeEditor, ProblemDescription, RunOutput, etc.)
- `drizzle/schema.ts` — database schema (users + solutions tables)
- `drizzle/migrations/` — auto-generated SQL migrations (do not edit manually)

**Database schema:** Drizzle ORM with PostgreSQL. Schema is in `drizzle/schema.ts`. After modifying the schema, run `db:generate` then `db:migrate`. Migrations run automatically on app startup via `hooks.server.ts`.

**Auth:** GitHub OAuth via Auth.js. User records are upserted on each login. Session is available in SvelteKit `locals.session`.
