# The toolchains moved out of this image and into the sandbox template in runner/sandbox.ts.
# This container no longer executes solutions — it provisions a VM per submission and talks to
# it over the Railway API — so it needs nothing beyond Node and the SDK. That deletes the
# OpenJDK/Rust/Clojure/GCC layers, the gVisor install, and the toolchain PPA along with them.
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/validate-packages.ts ./shared/
COPY runner/package.json ./runner/
RUN npm ci --workspace=runner --include-workspace-root=false

COPY runner/server.ts runner/sandbox.ts ./runner/

WORKDIR /app/runner
EXPOSE 3001
CMD ["node", "--experimental-strip-types", "server.ts"]
