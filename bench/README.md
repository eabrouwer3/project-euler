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
