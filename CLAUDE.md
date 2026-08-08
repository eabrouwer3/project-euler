# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
mise run dev          # Start dev server (or: npm run dev)
mise run build        # Build for production
mise run start        # Start production server

# Database
npm run db:generate   # Generate Drizzle migrations after schema changes
npm run db:migrate    # Apply pending migrations

# Infrastructure
docker compose up -d  # Start PostgreSQL
```

Always run `mise use` (not `nvm use`) before executing node/npm commands.

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — generate with `openssl rand -hex 32`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth app credentials
- `ORIGIN` — app origin URL (e.g. `http://localhost:5173`)

Docker Compose provides PostgreSQL at `localhost:5432` with default credentials `euler:euler`.

## Architecture

**Stack:** SvelteKit 2 + Svelte 5, TypeScript, Tailwind CSS 4, shadcn/ui (bits-ui), Drizzle ORM, PostgreSQL, Auth.js (GitHub OAuth), Monaco Editor, KaTeX, Railway Sandboxes for code execution.

**Routing layout groups:**
- `(app)/` — main app shell with sidebar navigation; requires auth
- `(auth)/` — login page

**Core data flow:**
1. Problem list and descriptions are fetched from `projecteuler.net/minimal=*` and cached in-memory for 1 hour
2. User solutions are stored in PostgreSQL (one row per user + problem + language)
3. Code execution: `POST /api/run` forwards to the runner service, which provisions a **Railway Sandbox** (a per-submission VM) from a toolchain checkpoint, runs the solution with a 30s timeout, and destroys it; supports Python, TypeScript (Bun), Clojure, Rust, C++, and x86-64 assembly (GNU as)

**Key directories:**
- `src/lib/server/` — auth, DB client, runner client, problem fetching
- `runner/` — the execution service: `sandbox.ts` owns the toolchain template and checkpoint, `server.ts` maps a language to a command
- `src/lib/components/` — Svelte UI components (CodeEditor, ProblemDescription, RunOutput, etc.)
- `drizzle/schema.ts` — database schema (users + solutions tables)
- `drizzle/migrations/` — auto-generated SQL migrations (do not edit manually)

**Database schema:** Drizzle ORM with PostgreSQL. Schema is in `drizzle/schema.ts`. After modifying the schema, run `db:generate` then `db:migrate`. Migrations run automatically on app startup via `hooks.server.ts`.

**Auth:** GitHub OAuth via Auth.js. User records are upserted on each login. Session is available in SvelteKit `locals.session`.
