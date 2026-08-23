# syntax=docker/dockerfile:1
#
# SPT 4.1 server image — game-root layout.
#
# Unlike image-4.0/ (which builds the server from source), 4.1 is DERIVED from the
# official image, published as a real multi-arch build (amd64 + arm64), so building
# it again ourselves buys nothing.
#
# UPSTREAM MOVED ORGS. sp-tarkov wound down after 4.1.2 (2026-08-06) and development
# continued under SP-Tushonka, which is where 4.1.3 onward is published - both the
# server image and the release archive. sp-tarkov's own repos and packages are still
# up, so image-4.0/ and image-3.11/ keep building from their pinned sp-tarkov tags and
# were deliberately NOT repointed: they are frozen and a migration could only break
# them. Only this file, the living line, follows the move.
#
# What we change is the FILESYSTEM LAYOUT, and only that:
#
#   upstream: app at /opt/spt, and /opt/spt/user is the only volume. The game root
#             is therefore /opt — inside the container, not on the host. Anything a
#             client-file mod writes relative to the server ("../BepInEx") lands on
#             the ephemeral container fs and is lost on recreate.
#
#   ours:     the bind mount IS the game root, laid out like a real SPT 4.1 install.
#             The server is seeded into and runs from <mount>/SPT_Runtime/, so
#             "../BepInEx" and "../ModSync.Updater.exe" resolve INSIDE the mount.
#
# NOTE THE FOLDER NAME: SPT 4.0 put the server in SPT/; 4.1 renamed it to
# SPT_Runtime/ ("Open your SPT_Runtime folder. Run SPT.Server." - was
# wiki.sp-tarkov.com/en/Manual-Install-Instructions, now 410 Gone along with the rest
# of that domain; the wiki moved to https://wiki.sp-tushonka.com and the deep link did
# not survive the move). The server binary
# itself doesn't care — it resolves user/ relative to its own directory — but mods
# and anyone comparing against a real install do, so we match upstream.
#
# Upstream is used as a BUILD STAGE, never as our runtime base — that deliberately
# drops their `VOLUME /opt/spt/user` declaration, which would otherwise follow us
# into every container as a stray anonymous volume we neither use nor clean up.
#
# Build:
#   docker build image-4.1/ -t spt-fika-server-4.1:4.1.3 \
#       --build-arg SPT_VERSION=4.1.3 --build-arg SPT_RELEASE=4.1.3-40743-ddce41c
#
# SPT_VERSION  = a tag published for ghcr.io/sp-tushonka/server-csharp (the server).
# SPT_RELEASE  = the full release id (<ver>-<build>-<hash>) of the SPT release
#                archive (the client scaffold). These are DIFFERENT identifiers —
#                bump both together on an SPT update.

ARG SPT_VERSION=4.1.3
ARG SPT_RELEASE=4.1.3-40743-ddce41c

FROM ghcr.io/sp-tushonka/server-csharp:${SPT_VERSION} AS upstream

# ---------------------------------------------------------------------------
# Scaffold donor — the client-facing half of a real SPT install.
#
# The official server image ships ONLY the server. A real install also has the
# BepInEx/doorstop client scaffold at the game root, which is what a client-file
# mod (ModSync) serves to players. That ships only in the SPT release archive, so
# fetch it, throw away its own (Windows) server, and keep the scaffold.
#
# Kept in a separate stage so curl/p7zip never reach the runtime image.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS scaffold
ARG SPT_RELEASE

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl p7zip-full ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Fetched from the GitHub release, NOT spt-releases.modd.in. That CDN carries only the
# CURRENT release — when 4.1.0 shipped it dropped 4.0.13 and broke the 4.0 image's build
# overnight. GitHub keeps every release asset. The release tag is derived from
# SPT_RELEASE (its leading version) so the two can't drift apart.
#
# SP-Tushonka/build, not sp-tarkov/build: the latter's releases stop at 4.1.2. The asset
# naming convention (SPT-<ver>-<build>-<hash>.7z) carried over unchanged.
RUN curl -fsSL "https://github.com/SP-Tushonka/build/releases/download/${SPT_RELEASE%%-*}/SPT-${SPT_RELEASE}.7z" -o /tmp/spt.7z \
    && 7z x /tmp/spt.7z -o/opt/gameroot >/dev/null \
    && rm -f /tmp/spt.7z

# Fail loudly if the archive is not shaped the way we expect, rather than silently
# producing an image with half a game root in it.
RUN set -e; \
    for p in BepInEx doorstop_config.ini winhttp.dll SPT_Runtime; do \
        [ -e "/opt/gameroot/$p" ] || { echo "FATAL: SPT-${SPT_RELEASE}.7z has no '$p' — release layout changed" >&2; exit 1; }; \
    done

# Drop the release's own server (Windows build) — the Linux server is copied in
# from the official image below. Then trim the SPT-client-only BepInEx bits, which
# are never needed for serving client files (matches image-4.0/). The doorstop
# bootstrap (winhttp.dll, doorstop_config.ini, .doorstop_version, licenses) stays.
RUN rm -rf /opt/gameroot/SPT_Runtime \
           /opt/gameroot/BepInEx/core \
           /opt/gameroot/BepInEx/plugins/spt \
           /opt/gameroot/BepInEx/patchers/spt-prepatch.dll \
           /opt/gameroot/BepInEx/config/BepInEx.cfg \
           /opt/gameroot/BepInEx/config/com.bepis.bepinex.configurationmanager.cfg \
    && mkdir -p /opt/gameroot/EscapeFromTarkov_Data

# ---------------------------------------------------------------------------
# Runtime — same base upstream targets (.NET 10, framework-dependent publish).
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0

ARG SPT_VERSION
ARG SPT_RELEASE
ENV SPT_VERSION=${SPT_VERSION}

# gosu: drop to PUID:PGID at exec. jq: patch http.json. curl: healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu jq curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The image baseline seeded into the mount on first boot: client scaffold at the
# game root, server in SPT_Runtime/. No Fika, no ModSync, no mods.
COPY --from=scaffold /opt/gameroot /opt/gameroot
COPY --from=upstream /opt/spt /opt/gameroot/SPT_Runtime

COPY init-server.sh /usr/local/bin/init-server.sh
RUN chmod +x /usr/local/bin/init-server.sh /opt/gameroot/SPT_Runtime/SPT.Server.Linux

# Defaults mirror docs/env-vars.md — the contract the web configurator emits.
ENV PUID=1000 \
    PGID=1000 \
    USER_NAME=spt \
    GROUP_NAME=spt \
    SPT_PORT=6969 \
    LISTEN_ALL_NETWORKS=false \
    VERBOSE_LOGS=true

EXPOSE 6969

# Upstream's own liveness endpoint. Fika is not installed here, so the Fika
# presence endpoint image-4.0/ can use is not an option.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsSk "https://localhost:${SPT_PORT}/health" || exit 1

LABEL org.opencontainers.image.title="SPT server (4.1, game-root layout)" \
      org.opencontainers.image.description="SPT 4.1 server derived from the official image, re-laid-out so the bind mount is the game root." \
      org.opencontainers.image.source="https://github.com/Dildz/SPT-Fika-Docker-Guide"

# Starts as root to seed and fix ownership, then drops to PUID:PGID.
ENTRYPOINT ["/usr/local/bin/init-server.sh"]
