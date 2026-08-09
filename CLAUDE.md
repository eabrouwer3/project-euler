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

**Stack:** Bun (runtime + package manager), SvelteKit 2 + Svelte 5, TypeScript, Tailwind CSS 4, shadcn/ui (bits-ui), Drizzle ORM, PostgreSQL, Auth.js (GitHub OAuth), CodeMirror 6, KaTeX, Railway Sandboxes for code execution.

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
2. Problems that hand out a data file (`names.txt` for 22, `triangle.txt` for 67) get it written into the run's working directory, so a solution can just open it by name. The file lands under the name the problem's own text uses, with the other spelling symlinked, and byte-for-byte — `materialiseFiles` adds no trailing newline, because problem 22's file ends without one. Small files ride inside the exec command; anything over `MAX_INLINE_BYTES` goes through the sandbox files API instead and stays on the VM for later runs. `exec` ships the script as one WebSocket frame, and problem 22's 46K list failed the exec when it travelled that way
3. User solutions are stored in PostgreSQL (one row per user + problem + language)
4. Code execution: `POST /api/run` runs one command with a 30s timeout in a **Railway Sandbox** — a VM booted from a toolchain checkpoint, held per user and reused across their runs. Opening a problem warms one in the background; it expires ~5 minutes after the last run. Supports Python, TypeScript (Bun), Clojure, Rust, C++, and x86-64 assembly (GNU as)

   Sandboxes are reused rather than created per submission because booting one costs 2-6s, which put a hello world at 10-15s end to end. Warming also rides on the editor's autosave, so a sandbox that expired during a long think is replaced before Run is pressed. An open tab cannot keep one alive — Railway's idle timer resets only on `exec`, so do not add a keep-alive ping: sandbox cost is essentially memory × wall-clock.

   **The isolation boundary between users is the VM, not the filesystem.** A user has root in their own sandbox and can read all of it; it holds only the toolchain and their own solutions. Each run gets its own directory (`/app/p<problem>-<language>`) purely so runs don't overwrite each other — that is correctness, not security, and nothing may rely on it to separate people. Sandboxes have full outbound internet in both network modes (that is how dependency installs work); `ISOLATED` only keeps them off the private network, so the app and Postgres are unreachable. Never pass a credential in the sandbox env: per-exec values travel in the command string and are visible to `ps` inside the sandbox.

**Editor:** CodeMirror 6, chosen over Monaco for the phone. Monaco implements text editing itself
over a hidden textarea and is unsupported in mobile browsers; CodeMirror edits inside a real
`contenteditable`, which is what gives back the platform's selection handles, magnifier, IME and
momentum scrolling. Three consequences worth knowing before changing `CodeEditor.svelte`:

- The view is built **once**, inside `untrack`. It seeds itself from `code`, `mode` and `compact`,
  and without `untrack` those become effect dependencies — every keystroke would rebuild the view
  and take the focus, selection and undo history with it. Language, theme and platform all change
  through compartments instead, never by re-creating the view.
- `drawSelection` is desktop-only. It paints its own selection over the native one, which is what
  makes multiple cursors visible and what would take the touch handles away.
- Grammars load on demand, one chunk per language, so a Python solver never downloads the C++
  parser. Assembly gained highlighting in the move: Monaco ships no x86 grammar and left it as
  plaintext.

**Mobile** is a different layout, not the desktop one squeezed. Below `md` the page is an ordinary
scrolling document: the editor is as tall as the solution (`autoHeight`, floored at `50dvh`), the
output panel is as tall as what it printed, and the page scrolls once. From `md` up nothing
changed — the shell is pinned to the viewport, panes scroll individually, and the output pane keeps
its draggable height. Every rule for this is `md:`-prefixed, so the mobile arrangement is the
unprefixed default.

Consequences worth knowing:

- Long lines scroll sideways rather than wrapping, which is only bearable because the editor no
  longer owns a vertical scroll to compete with. `.cm-gutters` carries a `padding-right` for it:
  the gutter is sticky, so code scrolls underneath, and `.cm-line`'s own padding scrolls away with
  the text.
- The editor's font is **16px** on mobile, and must not go below it: iOS zooms the page when you
  tap an editable element with smaller text, and the editor is the most-tapped thing on the page.
- `MobileKeyBar` supplies the characters a phone keyboard buries and Tab, which it lacks entirely —
  without it Python is unwritable on a phone. Its buttons act on `pointerdown` and `preventDefault`,
  because a blurred editor is a dismissed keyboard. It is `position: fixed`, since a bar in flow
  would scroll away from the keyboard it belongs to, and it pads `body` so the foot of the page can
  still be scrolled clear of it.
- Anything anchored to the viewport on mobile — both drawers, their backdrops, the key bar — must
  be `fixed`, not `absolute`. Their containers are now as tall as the page.
- `keyboardInset` (`$lib/viewport.svelte.ts`) is what lifts the key bar clear of the keyboard.
  `position: fixed` is placed against the layout viewport, which the keyboard does not move;
  `visualViewport` reports what is actually on screen. `interactive-widget=resizes-content` in the
  viewport meta makes Chrome shrink the layout viewport itself, so it reads 0 there — Safari does
  not honour it yet, and that is the case this carries.

**Key directories:**
- `src/lib/server/` — auth, DB client, code execution, problem fetching
- `src/lib/editor/` — CodeMirror wiring: the Atom One themes ported from Monaco, and the
  per-language grammar and indent width
- `src/lib/server/sandbox.ts` — the sandbox layer: toolchain template, checkpoint lifecycle, and running one command in a throwaway VM
- `src/lib/server/run-code.ts` — maps a language and its packages to the files and command that produce the solution's output
- `src/lib/components/` — Svelte UI components (CodeEditor, ProblemDescription, RunOutput, etc.)
- `drizzle/schema.ts` — database schema (users + solutions tables)
- `drizzle/migrations/` — auto-generated SQL migrations (do not edit manually)

**Database schema:** Drizzle ORM with PostgreSQL. Schema is in `drizzle/schema.ts`. After modifying the schema, run `db:generate` then `db:migrate`. Migrations run automatically on app startup via `hooks.server.ts`.

**Auth:** GitHub OAuth via Auth.js. User records are upserted on each login. Session is available in SvelteKit `locals.session`.
