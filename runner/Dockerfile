FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Base tools + Java
RUN apt-get update && apt-get install -y \
    curl wget ca-certificates gnupg unzip \
    default-jdk \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Node 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Deno
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

# Clojure CLI
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
    && cd /tmp/clj-warmup && clj -M main.clj \
    && rm -rf /tmp/clj-warmup

WORKDIR /app
COPY package.json server.ts ./

EXPOSE 3001
CMD ["node", "--experimental-strip-types", "server.ts"]
