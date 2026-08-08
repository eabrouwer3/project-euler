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

## Verdict — Sandboxes fit comfortably

**All six languages run correctly, worst end-to-end 6.23s against a 30s budget.** Measured
with PATH set per-exec and round-robin sampling; spreads are 1.1–1.3x max/min, so these are
the first per-language numbers worth quoting.

| language | min | median | max |
|---|---|---|---|
| python | 3.63s | 3.77s | 4.29s |
| typescript | 3.58s | 3.90s | 3.91s |
| clojure | 5.68s | 5.70s | 6.23s |
| rust | 4.66s | 4.91s | 5.94s |
| cpp | 4.03s | 4.27s | 4.47s |
| assembly | 3.79s | 3.87s | 4.40s |

| phase | min | median | max |
|---|---|---|---|
| create (bare) | 2.02s | 2.21s | 2.45s |
| create (from template) | 2.13s | 2.57s | 3.78s |
| create (from checkpoint) | 1.60s | **1.74s** | 1.79s |
| fork (from warm base) | 2.67s | 3.18s | 3.82s |
| checkpoint capture | — | 1.05s | — |
| destroy | 0.12s | 0.14s | 0.16s |
| exec round-trip | 0.61s | 0.62s | 0.63s |

Checkpoint restore is the fastest way in and needs no permanently running base. Roughly 2.4s
of each end-to-end figure is provisioning; the rest is the language's own startup and compile.

## C++26 on the Debian base — not a blocker

`runner/Dockerfile` gets C++26 from GCC 16 via an Ubuntu-only PPA, which has no equivalent on
the sandbox's Debian trixie base. It turns out not to matter:

- **Stock g++ 14 already accepts `-std=c++26`** and compiles `<print>` and `<ranges>` to the
  correct answer — verified, not assumed.
- **`apt-get install -y g++-15` succeeds** on the base image, so GCC 15 is available if the
  extra C++26 coverage is wanted.

Install g++-15 with an explicit `.run('apt-get install -y g++-15')` step. Passing it through
`.withPackages()` failed in probing for reasons not chased down; the explicit run step is
verified working.

### Never pass `env` at create time

Setting `env` on create costs **2.41s per sandbox** — median 4.34s versus 1.93s in an
interleaved A/B (`--runs=6`). It is the tidy-looking way to give a sandbox its PATH and it
roughly doubles provisioning. Pass `env` to `exec` instead, where per-command variables travel
inside the command string and cost nothing. The docs' caveat that this exposes values to `ps`
is irrelevant for a PATH; it would matter for a secret.

### Sample round-robin, not grouped

Provisioning latency drifts over minutes. Taking all samples of one language back to back
charges that drift to whichever language held the slow window — which is how clojure appeared
to regress 3x between runs where nothing about clojure changed. The benchmark now interleaves.

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

## Root cause: `exec` runs with no PATH

A sandbox `exec` gets **no PATH in its environment**. Every toolchain failure seen across three
runs was this one bug wearing different masks:

| symptom | what was actually happening |
|---|---|
| `g++: cannot execute 'cc1plus'` | g++ spawns cc1plus via `posix_spawnp`, which searches PATH |
| `collect2: cannot find 'ld'` | same, one level down |
| `rustc: linker 'cc' not found` | same, different compiler |

It is well disguised. `command -v g++` answers correctly whether or not the environment has a
PATH, because bash falls back to a compiled-in default — so every check that *looks* like it
verifies the toolchain reports health, right up until something spawns a helper. Template
builds have a normal PATH, so nothing fails there either.

The tell was `env | grep -i '^PATH='` printing nothing, next to `-print-search-dirs` emitting
relative `../lib/gcc/...` paths — gcc could not resolve its own prefix.

Fixed by baking PATH into every sandbox at create time via the `env` option (`SANDBOX_ENV`),
which covers all commands at once rather than prefixing each one. **A port must do the same:
never assume a sandbox command inherits a usable environment.**

Two earlier readings of this were wrong and are recorded so the reasoning is not repeated:
first that files were lost between template and sandbox (disproved — `cc1plus` is on disk),
then that gcc's search path missed `/usr/libexec` (also wrong — the search path was fine, the
environment was not).

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
