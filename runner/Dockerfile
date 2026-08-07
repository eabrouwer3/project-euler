FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Base tools + OpenJDK 21
RUN apt-get update && apt-get install -y \
    curl wget ca-certificates gnupg unzip \
    openjdk-21-jdk \
    && rm -rf /var/lib/apt/lists/*

# uv + Python 3.13
RUN curl -fsSL https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN uv python install 3.13

# Node 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Bun 1
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

# GCC 14 for C++23, plus binutils (as/ld) for assembly and rustc's linker.
# g++-14 is not noble's default, so alternatives make plain `g++`/`gcc` resolve to it.
RUN apt-get update && apt-get install -y build-essential g++-14 gcc-14 \
    && update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-14 100 \
    && update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-14 100 \
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

# gVisor (runsc) — server.ts auto-detects and falls back gracefully if unavailable
RUN curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
    > /etc/apt/sources.list.d/gvisor.list \
    && apt-get update && apt-get install -y runsc \
    && rm -rf /var/lib/apt/lists/*

# Pre-warm Clojure Maven cache (bakes ~/.m2 into the image layer)
RUN mkdir -p /tmp/clj-warmup \
    && echo '(println "warmed")' > /tmp/clj-warmup/main.clj \
    && echo '{:deps {}}' > /tmp/clj-warmup/deps.edn \
    && cd /tmp/clj-warmup && clojure -M main.clj \
    && rm -rf /tmp/clj-warmup

WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/validate-packages.ts ./shared/
COPY runner/package.json ./runner/
RUN npm ci --workspace=runner --include-workspace-root=false

COPY runner/server.ts ./runner/

WORKDIR /app/runner
EXPOSE 3001
CMD ["node", "--experimental-strip-types", "server.ts"]
