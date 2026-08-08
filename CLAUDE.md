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
1. Problem list and descriptions are fetched from `projecteuler.net/minimal=*` and cached in-memory (the list for 1 hour, a description for the life of the process). Descriptions link images, data files and other problems relative to projecteuler.net's document root, so `resolveLinks` absolutises them — without it every problem image renders broken
2. Problems that hand out a data file (`names.txt` for 22, `triangle.txt` for 67) get it written into the run's working directory, so a solution can just open it by name. The file lands under the name the problem's own text uses, with the other spelling symlinked, and byte-for-byte — `materialiseFiles` adds no trailing newline, because problem 22's file ends without one
3. User solutions are stored in PostgreSQL (one row per user + problem + language)
4. Code execution: `POST /api/run` runs one command with a 30s timeout in a **Railway Sandbox** — a VM booted from a toolchain checkpoint, held per user and reused across their runs. Opening a problem warms one in the background; it expires ~5 minutes after the last run. Supports Python, TypeScript (Bun), Clojure, Rust, C++, and x86-64 assembly (GNU as)

   Sandboxes are reused rather than created per submission because booting one costs 2-6s, which put a hello world at 10-15s end to end. Warming also rides on the editor's autosave, so a sandbox that expired during a long think is replaced before Run is pressed. An open tab cannot keep one alive — Railway's idle timer resets only on `exec`, so do not add a keep-alive ping: sandbox cost is essentially memory × wall-clock.

   **The isolation boundary between users is the VM, not the filesystem.** A user has root in their own sandbox and can read all of it; it holds only the toolchain and their own solutions. Each run gets its own directory (`/app/p<problem>-<language>`) purely so runs don't overwrite each other — that is correctness, not security, and nothing may rely on it to separate people. Sandboxes have full outbound internet in both network modes (that is how dependency installs work); `ISOLATED` only keeps them off the private network, so the app and Postgres are unreachable. Never pass a credential in the sandbox env: per-exec values travel in the command string and are visible to `ps` inside the sandbox.

**Key directories:**
- `src/lib/server/` — auth, DB client, code execution, problem fetching
- `src/lib/server/sandbox.ts` — the sandbox layer: toolchain template, checkpoint lifecycle, and running one command in a throwaway VM
- `src/lib/server/run-code.ts` — maps a language and its packages to the files and command that produce the solution's output
- `src/lib/components/` — Svelte UI components (CodeEditor, ProblemDescription, RunOutput, etc.)
- `drizzle/schema.ts` — database schema (users + solutions tables)
- `drizzle/migrations/` — auto-generated SQL migrations (do not edit manually)

**Database schema:** Drizzle ORM with PostgreSQL. Schema is in `drizzle/schema.ts`. After modifying the schema, run `db:generate` then `db:migrate`. Migrations run automatically on app startup via `hooks.server.ts`.

**Auth:** GitHub OAuth via Auth.js. User records are upserted on each login. Session is available in SvelteKit `locals.session`.
