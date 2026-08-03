# syntax=docker/dockerfile:1
#
# SPT-FIKA-Docker — multi-major, build-from-source SPT server image.
#
# Phase 1: the 4.0 (C#/.NET) path is implemented and the focus. The 3.11 (Node) path
# is present but UNVERIFIED (see DESIGN.md §13). Select the major with --build-arg.
#
#   docker build image-4.0/ -t spt-fika-server:4.0.13 \
#       --build-arg SPT_MAJOR=4 --build-arg SPT_VERSION=4.0.13
#
# Native multi-arch (amd64 + arm64) comes from compiling the server from source per
# target arch, so one image: reference resolves correctly on either. See DESIGN.md §7/§8.

ARG SPT_MAJOR=4
# Must be a valid tag/branch of the matching sp-tarkov repo
# (server-csharp for 4.x, server for 3.11.x).
ARG SPT_VERSION=4.0.13

# ============================================================================
# build-v4 — compile SPT 4.0 (C# / .NET) from source for the target architecture.
# Adapted from Outshynd's spt-server image (DESIGN.md §4).
# ============================================================================
# Building SPT 4.0.13 needs BOTH majors of .NET, for two different reasons:
#
#   SDK 10  — the source uses C# 14 ('null conditional assignment' in
#             LocationLifecycleService.cs). The C# 13 compiler in SDK 9 rejects it:
#             "error CS8652: the feature ... is currently in Preview and *unsupported*".
#   .NET 9 runtime — SPTarkov.Server.Core's post-build step EXECUTES
#             Ceciler.Launcher.dll (a net9.0 IL post-processor) via `dotnet`. Without a
#             9.0 runtime it dies with "Framework 'Microsoft.NETCore.App', version
#             '9.0.0' ... The following frameworks were found: 10.0.10", exit code 150.
#
# sdk:10.0-noble used to carry a 9.0 runtime as well, which is why this built fine for
# months and then stopped without a single change on our side. We now put it back
# explicitly instead of relying on the base image to keep shipping it. COPY merges into
# the shared-framework directory, so 10.x stays alongside.
FROM mcr.microsoft.com/dotnet/aspnet:9.0-noble AS dotnet9-runtime

FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build-v4
COPY --from=dotnet9-runtime /usr/share/dotnet/shared/Microsoft.NETCore.App \
                            /usr/share/dotnet/shared/Microsoft.NETCore.App
RUN dotnet --list-runtimes | grep -q 'Microsoft.NETCore.App 9\.' \
 || { echo "FATAL: .NET 9 runtime missing — Ceciler post-build will fail" >&2; exit 1; }
ARG TARGETOS
ARG TARGETARCH
ARG SPT_VERSION

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates git git-lfs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN git clone --depth 1 --branch "$SPT_VERSION" \
        https://github.com/sp-tarkov/server-csharp.git server
WORKDIR /tmp/server
RUN git lfs pull

# Drop the self-contained apphost AssemblyName overrides so publish emits a plain
# framework-dependent SPT.Server.dll we launch with `dotnet` (arch-clean, smaller).
RUN sed -i '/<AssemblyName>SPT.Server.Linux<\/AssemblyName>/d' ./SPTarkov.Server/SPTarkov.Server.csproj \
 && sed -i '/<AssemblyName>SPT.Server.Mac<\/AssemblyName>/d'   ./SPTarkov.Server/SPTarkov.Server.csproj

RUN dotnet publish ./SPTarkov.Server/SPTarkov.Server.csproj \
        -c Release -f net9.0 -r "${TARGETOS}-${TARGETARCH}" \
        --self-contained false \
        -p:SptBuildType=RELEASE \
        -p:SptVersion="$SPT_VERSION" \
        -p:SptBuildTime="$(date +%Y%m%d)" \
        -p:SptCommit="$(git rev-parse --short HEAD)" \
        -p:IsPublish=true \
        -p:UseAppHost=false \
        -o /app/publish \
 && rm -f /app/publish/*.pdb \
 && echo "$SPT_VERSION" > /app/publish/.version

# ============================================================================
# build-v3 — compile SPT 3.11 (TypeScript / Node) from source. WIP / UNVERIFIED
# (DESIGN.md §13). buildkit prunes this stage entirely unless SPT_MAJOR=3.
# ============================================================================
FROM debian:bookworm AS build-v3
ARG SPT_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates git git-lfs xz-utils \
 && rm -rf /var/lib/apt/lists/*
# Node 20 is the toolchain SPT 3.11 builds with.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$SPT_VERSION" \
        https://github.com/sp-tarkov/server.git /tmp/spt
WORKDIR /tmp/spt/project
RUN git lfs pull
# SPT 3.11's project ships NO package-lock.json → npm install, not `npm ci`.
# The setEncoding strip is the 2024 guide's known workaround for the pkg build
# (harmless no-op if the line isn't present).
RUN sed -i '/setEncoding/d' src/Program.ts || true
RUN npm install \
 && npm run build:release \
 && mv build /app/publish        # emits SPT.Server.exe (pkg-bundled Node binary)

# ============================================================================
# final — shared runtime. 4.0 needs the .NET runtime (aspnet); 3.11's pkg exe is
# self-contained but runs here fine too (DESIGN.md §7 leaves splitting the base as
# a later optimisation). The COPY --from picks the stage for the selected major.
# ============================================================================
# Alias the selected build stage. FROM expands ARGs (--from does NOT), so this is the
# documented workaround for picking a build stage by build-arg. buildkit still prunes
# the unselected stage — a 4.0 build never runs the Node stage, and vice-versa.
FROM build-v${SPT_MAJOR} AS build-selected

FROM mcr.microsoft.com/dotnet/aspnet:9.0-noble AS final
ARG SPT_MAJOR
# Full SPT release build id (<ver>-<build>-<hash>) for the client-scaffold download.
# This is a DIFFERENT identifier from SPT_VERSION (the git tag the server is built from),
# so it's a separate pin — bump both together on an SPT update.
ARG SPT_RELEASE=4.0.13-40087-2891fd4

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl gosu jq unzip p7zip-full \
 && rm -rf /var/lib/apt/lists/*

# Game-root baseline. The from-source build only emits the managed server; the client
# scaffold (BepInEx / doorstop / winhttp) ships ONLY in the SPT release, so fetch the
# release and keep everything EXCEPT its own server dir, then drop the arch-native
# from-source server into SPT/. init-server seeds this whole tree into the mount, giving
# a complete SPT 4 install. (SPT 4 only; the 3.11 flat layout is built from image-3.11/.)
#
# Trim SPT-client-only bits from BepInEx — never needed for ModSync client staging
# (matches the live update-server.sh backup excludes): the SPT client plugins/patcher
# and the regenerated BepInEx configs. The doorstop bootstrap (winhttp.dll,
# doorstop_config.ini, .doorstop_version, licenses) is kept.
# Fetched from the GitHub release, NOT spt-releases.modd.in. That CDN carries only the
# CURRENT release: when 4.1.0 shipped (2026-08-01) the 4.0.13 archive 404'd and this
# build broke, despite 4.0.13 being a frozen pin that had built fine for months. GitHub
# keeps every release asset, so a frozen line stays buildable. The release tag is derived
# from SPT_RELEASE (its leading version) so the two can't drift apart.
RUN if [ "${SPT_MAJOR}" = "4" ]; then \
        curl -fsSL "https://github.com/sp-tarkov/build/releases/download/${SPT_RELEASE%%-*}/SPT-${SPT_RELEASE}.7z" -o /tmp/spt.7z \
     && 7z x /tmp/spt.7z -o/opt/gameroot >/dev/null \
     && rm -rf /opt/gameroot/SPT /tmp/spt.7z \
     && rm -rf /opt/gameroot/BepInEx/core \
               /opt/gameroot/BepInEx/plugins/spt \
               /opt/gameroot/BepInEx/patchers/spt-prepatch.dll \
               /opt/gameroot/BepInEx/config/BepInEx.cfg \
               /opt/gameroot/BepInEx/config/com.bepis.bepinex.configurationmanager.cfg ; \
    else mkdir -p /opt/gameroot ; fi

COPY --from=build-selected --chmod=755 /app/publish /opt/gameroot/SPT

COPY --chmod=755 init-server.sh /usr/bin/init-server
COPY --chmod=755 scripts/ /opt/scripts/

ENV SPT_MAJOR=${SPT_MAJOR} \
    SPT_PORT=6969
EXPOSE 6969

# SPT serves HTTPS with a self-signed cert, hence -k. /launcher/ping needs no Fika.
# Timings match image-4.1/ so every line reports healthy on the same schedule. Docker
# runs the first probe one interval after start, so the interval is a floor on how
# soon a container can be marked healthy — at the old 180s, `docker compose up --wait`
# and any service_healthy dependency sat idle for three minutes on a server that was
# ready in twenty seconds.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fk --header "responsecompressed:0" "https://localhost:${SPT_PORT}/launcher/ping" || exit 1

ENTRYPOINT ["/usr/bin/init-server"]
