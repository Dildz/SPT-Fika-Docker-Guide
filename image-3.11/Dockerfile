# SPT 3.11 server — build-from-source, env-driven (Fika / ModSync / mods installed
# at boot from env vars, same contract as the 4.0 image). Build-once: 3.11 is frozen.
#
#   docker build -t spt-fika-server-3.11.x:3.11.4 .
#
# Built + booted on arm64; CI builds amd64 + arm64 on native runners. No external
# scripts — this file clones and builds SPT itself; the env-driven layer (init-server
# + scripts) is baked in and drives everything at container start.

ARG SPT_VERSION=3.11.4

# ---------- build ----------
FROM debian:bookworm AS build
ARG SPT_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates git git-lfs xz-utils \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$SPT_VERSION" \
        https://github.com/sp-tarkov/server.git /src
WORKDIR /src/project
RUN git lfs pull
# 3.11 ships no package-lock.json (so npm install, not ci); setEncoding strip is
# the 2024 guide's known workaround for the pkg build.
RUN sed -i '/setEncoding/d' src/Program.ts || true
RUN npm install \
 && npm run build:release \
 && mv build /opt/SPT
RUN chmod +x /opt/SPT/SPT.Server.exe

# ---------- runtime ----------
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gosu jq unzip p7zip-full \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build --chmod=755 /opt/SPT /opt/SPT
COPY --chmod=755 init-server.sh /usr/bin/init-server
COPY --chmod=755 scripts/ /opt/scripts/
ENV SPT_PORT=6969
# Documentation only — the server binds $SPT_PORT, so a changed port still works here.
EXPOSE 6969
# SPT serves HTTPS with a self-signed cert; /launcher/ping needs no Fika.
# Timings match image-4.1/ so every line reports healthy on the same schedule (Docker
# runs the first probe one interval after start, so the interval is a floor on how soon
# a container can be marked healthy).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fk --header "responsecompressed:0" "https://localhost:${SPT_PORT}/launcher/ping" || exit 1
ENTRYPOINT ["/usr/bin/init-server"]
