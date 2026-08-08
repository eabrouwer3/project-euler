# The toolchains moved out of this image and into the sandbox template in runner/sandbox.ts.
# This container no longer executes solutions — it provisions a VM per submission and talks to
# it over the Railway API — so it needs nothing beyond Bun and the SDK. That deletes the
# OpenJDK/Rust/Clojure/GCC layers, the gVisor install, and the toolchain PPA along with them.
# Bun also runs the TypeScript directly, so there is no type-stripping flag to keep in sync.
FROM oven/bun:1-slim

WORKDIR /app
COPY package.json bun.lock ./
COPY shared/package.json shared/validate-packages.ts ./shared/
COPY runner/package.json ./runner/
RUN bun install --frozen-lockfile --filter euler-runner

COPY runner/server.ts runner/sandbox.ts ./runner/

WORKDIR /app/runner
EXPOSE 3001
CMD ["bun", "run", "server.ts"]
