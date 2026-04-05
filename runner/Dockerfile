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

# Deno 2
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local DENO_VERSION=v2.3.3 sh

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
COPY package.json server.ts ./

EXPOSE 3001
CMD ["node", "--experimental-strip-types", "server.ts"]
