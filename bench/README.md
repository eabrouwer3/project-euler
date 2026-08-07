# Sandbox latency benchmark

Answers one question before any migration work starts: can Railway Sandboxes serve a code
submission inside the runner's 30s budget?

## Running it

```bash
bun add railway

export RAILWAY_API_TOKEN=...        # railway.com/account/tokens
export RAILWAY_ENVIRONMENT_ID=26078101-0af8-444b-bd85-45b78f2a60f6   # gallant-insight / production

bun bench/sandbox-latency.ts --quick   # bare lifecycle only, ~1 min
bun bench/sandbox-latency.ts           # full: template + fork + checkpoint + per-language e2e
```

Requires Sandboxes, which are gated behind
[Priority Boarding](https://docs.railway.com/platform/priority-boarding).

## What it measures

| Phase | Why it matters |
|---|---|
| `create (bare)` | The floor — VM boot with nothing on disk |
| `exec round-trip` | Fixed per-command overhead, paid by every submission |
| `create (from template)` | Cold path if each submission provisions its own sandbox |
| `fork (from warm base)` | The likely production path: keep a base warm, fork per submission |
| `create (from checkpoint)` | Same idea, but survives the base being destroyed |
| `e2e <lang>` | fork → write file → run → destroy, per language, with a real solution |

The verdict line at the end compares the worst end-to-end against the 30s budget.

## Verdict — Sandboxes fit, comfortably

Worst end-to-end **12.55s against the 30s budget**, once the benchmark's own bugs were out of
the way. Per-language, provisioning from a checkpoint:

| language | min | median | max |
|---|---|---|---|
| python | 4.39s | 5.33s | 5.65s |
| typescript | 3.58s | 5.43s | 5.78s |
| clojure | 4.90s | 10.78s | 12.55s |
| rust | 4.26s | 4.60s | 5.77s |
| cpp | 3.55s | 3.67s | 3.76s |
| assembly | 3.15s | 3.43s | 3.53s |

`exec` round-trip is 0.65s. Fixed provisioning overhead is ~2.3s (checkpoint restore).

Clojure remains the outlier at 3x spread even with its classpath cache warmed in `/app` — JVM
startup plus classpath resolution. It still fits, but it is the one to watch.

**The cpp figures are not real**: g++ never compiled (see below), so those are the cost of
provisioning plus a fast failure.

## Results — 2026-08-07, us-east4-eqdc4a, 3 runs/phase

| phase | min | median | max |
|---|---|---|---|
| create (bare) | 2.88s | 3.01s | 3.13s |
| create (from template) | 3.26s | **3.41s** | 4.65s |
| fork (from warm base) | 4.90s | **5.12s** | 5.36s |
| create (from checkpoint) | 2.56s | **2.73s** | 2.97s |
| checkpoint capture | — | 6.09s | — | 
| template build | — | 39.14s | — |
| destroy | 0.16s | 0.16s | 0.27s |

**Restoring from a checkpoint beats forking a warm base**, by roughly 2.4s — the opposite of
the obvious design. Forking was the intuitive choice ("keep a base hot, branch per request")
and it is the slowest of the three. It also costs a permanently running base sandbox that
bills while idle, so it loses on both axes. Provision each submission from a checkpoint.

Carrying the full toolchain barely registers: create-from-template (3.41s) is only ~0.4s
worse than a bare VM (3.01s), so template size is not the thing to optimise.

That puts fixed overhead around **2.7–3.0s of the 30s budget**, leaving ~27s for the solution.

`exec` round-trip measured separately from an unrestricted network: **0.65s**.

## Open: g++ cannot locate cc1plus at runtime

`g++` fails with `cannot execute 'cc1plus': posix_spawnp: No such file or directory`, while
the binary is present at `/usr/libexec/gcc/x86_64-linux-gnu/14/cc1plus` and g++ compiles
correctly during the template build.

An earlier reading of this — that files were being lost between the template and the running
sandbox — was wrong, and the on-disk `find` result disproves it. `g++ -print-prog-name=cc1plus`
answering with the bare name means gcc's *search* failed, not that the file is absent. Two
explanations remain: gcc's search path does not cover `/usr/libexec`, or the binary cannot be
exec'd (a missing ELF interpreter also reports ENOENT). The diagnostic now separates them and
tests whether `-B` forces resolution, which is the fix a search-path fault would imply.

Until that resolves, C++ is the one language not demonstrated working on Sandboxes. Note this
is a *different* problem from the GCC 16 / C++26 gap below.

### Artifacts already corrected

The first e2e run was inflated by benchmark bugs, not sandbox cost:

- **python 27–33s** — `withEnv` applies to build steps only and is *not* baked into sandboxes,
  so `UV_PYTHON_INSTALL_DIR` was unset at runtime and `uv run` re-downloaded the interpreter
  (~23s). Now symlinked to `/usr/local/bin/python3.13` at build time, needing no runtime env.
- **clojure** — `.cpcache` is written relative to cwd, so warming it in `/tmp` bought nothing.
  Warmups now run in `/app`, where solutions actually execute.
- **e2e provisioning** used `fork` (~5.5s) rather than checkpoint restore (~2.7s).
- **rust** reported `rustc=MISSING`: rustup installs under `/root/.cargo/bin`, off the runtime
  PATH. It only passed because the benchmark's own command prepended that directory — the
  benchmark was hiding the bug it should have caught. Now symlinked into `/usr/local/bin`, and
  the command no longer sets PATH, so a regression fails loudly.

## Notes

- **Region matters.** Sandboxes default to `us-west2` regardless of account preference, while
  these services run in `us-east4-eqdc4a`. The benchmark pins `us-east4-eqdc4a`; override with
  `BENCH_REGION`.
- **Idle sandboxes bill.** Everything is created with a 1-minute idle timeout and destroyed in
  a `finally`, but a crashed run can still leak — check `railway sandbox list` afterwards.
- **The template is not yet a faithful port.** It uses the distro `g++` rather than the GCC 16
  toolchain PPA in `runner/Dockerfile`, because that PPA is Ubuntu-specific and the sandbox base
  is Debian. Getting C++26 back is a real migration task, not a benchmark concern.
- Hobby plan caps this environment at 50 concurrent sandboxes, which is also the ceiling on
  concurrent submissions if the design is one sandbox per run.
