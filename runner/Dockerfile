FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Base tools + OpenJDK 21.
# tini is here to reap: a timed-out solution is killed by process group, which leaves the
# sandbox's own processes orphaned onto PID 1, and node never wait()s on children it did
# not spawn — so without an init every timeout would strand a zombie.
RUN apt-get update && apt-get install -y \
    curl wget ca-certificates gnupg unzip tini \
    openjdk-21-jdk \
    && rm -rf /var/lib/apt/lists/*

# uv + Python 3.13.
# The interpreter goes to an absolute, HOME-independent path: server.ts runs solutions with
# HOME=/tmp, so a default install under /root would be invisible at runtime and uv would try
# to re-download it — which the sandboxed, network-less run phase cannot do.
RUN curl -fsSL https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python
RUN uv python install 3.13

# Node 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Bun 1
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

# GCC 16 for C++26, plus binutils (as/ld) for assembly and rustc's linker.
# noble's own archive stops at g++-14, so the toolchain PPA supplies 16 — a trunk snapshot,
# since no distro has a noble build of the 16.1 release. The `noble` suite below tracks the
# base image at the top of this file. build-essential's own `g++` is an alternative already
# registered at priority 100, so `update-alternatives --install` would tie and lose; a
# /usr/local/bin symlink wins on PATH instead and leaves dpkg's links untouched.
RUN curl -fsSL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xC8EC952E2A0E1FBDC5090F6A2C277A0A352154E5" \
        | gpg --dearmor -o /usr/share/keyrings/ubuntu-toolchain-r.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/ubuntu-toolchain-r.gpg] https://ppa.launchpadcontent.net/ubuntu-toolchain-r/test/ubuntu noble main" \
        > /etc/apt/sources.list.d/ubuntu-toolchain-r.list \
    && apt-get update && apt-get install -y build-essential g++-16 gcc-16 \
    && ln -sf /usr/bin/gcc-16 /usr/local/bin/gcc \
    && ln -sf /usr/bin/g++-16 /usr/local/bin/g++ \
    && ln -sf /usr/bin/cpp-16 /usr/local/bin/cpp \
    && rm -rf /var/lib/apt/lists/*

# Rust (stable)
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo
ENV PATH="/usr/local/cargo/bin:$PATH"
RUN curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs \
    | sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable \
    && chmod -R a+w $CARGO_HOME

# Clojure 1.12 CLI
RUN curl -fsSL https://github.com/clojure/brew-install/releases/latest/download/linux-install.sh -o /tmp/clj-install.sh \
    && chmod +x /tmp/clj-install.sh \
    && /tmp/clj-install.sh \
    && rm /tmp/clj-install.sh

# gVisor (runsc). server.ts probes it at startup and logs why it was rejected; set
# REQUIRE_SANDBOX=1 to refuse to boot rather than fall back to ulimits alone. Note that
# rootless runsc needs unprivileged user namespaces, so it stays unavailable on hosts whose
# seccomp profile denies clone(CLONE_NEWUSER) — most managed container platforms.
RUN curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
    > /etc/apt/sources.list.d/gvisor.list \
    && apt-get update && apt-get install -y runsc \
    && rm -rf /var/lib/apt/lists/*

# Pre-warm the Clojure Maven cache. HOME matches the value server.ts runs solutions under,
# so the warmed repo lands in /tmp/.m2 where the fetch phase will actually find it.
RUN mkdir -p /tmp/clj-warmup \
    && echo '(println "warmed")' > /tmp/clj-warmup/main.clj \
    && echo '{:deps {}}' > /tmp/clj-warmup/deps.edn \
    && cd /tmp/clj-warmup && HOME=/tmp clojure -M main.clj \
    && rm -rf /tmp/clj-warmup

WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/validate-packages.ts ./shared/
COPY runner/package.json ./runner/
RUN npm ci --workspace=runner --include-workspace-root=false

COPY runner/server.ts ./runner/

WORKDIR /app/runner
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--experimental-strip-types", "server.ts"]
