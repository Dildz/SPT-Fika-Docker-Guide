#!/bin/bash
set -e
#
# SPT-FIKA-Docker entrypoint (Phase 1).
# Brings up a vanilla SPT server. The 4.0 path is implemented; the 3.11 run-command
# is branched but unverified. Everything below is driven by env vars — this set is
# the contract the web configurator targets (docs/env-vars.md).

# ---- env (user-configurable) ----
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
USER_NAME="${USER_NAME:-spt}"
GROUP_NAME="${GROUP_NAME:-spt}"
SPT_MAJOR="${SPT_MAJOR:-4}"
VERBOSE_LOGS="${VERBOSE_LOGS:-true}"
LISTEN_ALL_NETWORKS="${LISTEN_ALL_NETWORKS:-false}"
USE_MODSYNC="${USE_MODSYNC:-false}"

# ---- paths ----
# The bind mount is the GAME ROOT (matches a real SPT 4 + Fika install): the SPT server
# lives in the SPT/ subdir and runs from there, while the client-facing scaffold
# (BepInEx/, doorstop_config.ini, winhttp.dll) sits at the game root. Both are seeded on
# first boot from the image baseline — the SPT release scaffold with the from-source
# server dropped into SPT/ — so the mount ends up a complete SPT 4 install. The server's
# "../BepInEx" etc. resolve INSIDE the mount, where ModSync serves its client files from.
IMAGE_SRC=/opt/gameroot   # full game-root baseline built into the image (scaffold + SPT/)
SERVER=/opt/server        # host bind mount — the game root (persistent)
SPT_DIR="$SERVER/SPT"     # the SPT server install; the server runs from here

orange="\033[38;5;208m"; reset="\033[0m"

banner() {
    echo "========================================================="
    echo "==  SPT-FIKA-Docker  |  SPT_MAJOR=$SPT_MAJOR  UID=$PUID:$PGID  =="
    echo "========================================================="
}

# Create the runtime user/group, reusing any that already own the mount.
setup_user_and_group() {
    getent group  "$PGID" >/dev/null || groupadd -g "$PGID" "$GROUP_NAME"
    getent passwd "$PUID" >/dev/null || useradd -u "$PUID" -g "$PGID" -d "$SERVER" -s /bin/sh "$USER_NAME"
    GROUP_NAME="$(getent group  "$PGID" | cut -d: -f1)"
    USER_NAME="$(getent passwd "$PUID" | cut -d: -f1)"
}

# First boot: copy the image-built game root (client scaffold + SPT/ server) into the
# (empty) bind mount, so the whole install persists on the host. Re-seeding / version
# updates are Phase 2.
seed_server() {
    if [ -z "$(ls -A "$SERVER" 2>/dev/null)" ]; then
        echo -e "${orange}Note: $SERVER is empty — bind-mount a host dir here to persist server files.${reset}"
    fi
    if [ ! -e "$SPT_DIR/SPT.Server.dll" ] && [ ! -e "$SPT_DIR/SPT.Server.exe" ]; then
        echo "First boot — seeding full game-root install into $SERVER"
        mkdir -p "$SERVER"
        cp -a "$IMAGE_SRC/." "$SERVER/"
    else
        echo "Existing server files found in $SPT_DIR (version updates handled in Phase 2)"
    fi
    mkdir -p "$SPT_DIR/user/mods" "$SPT_DIR/user/profiles"
    chown -R "$PUID:$PGID" "$SERVER"
}

# The game-root client scaffold (BepInEx/) only matters when ModSync serves it to
# clients, so gate it on USE_MODSYNC each boot: without ModSync it has no purpose →
# remove it; with ModSync keep it and ensure an EMPTY EscapeFromTarkov_Data/ exists
# (Dynamic Maps stages client files there). The doorstop bootstrap (winhttp.dll,
# doorstop_config.ini, .doorstop_version, licenses) always stays either way.
gate_modsync_scaffold() {
    if [ "$USE_MODSYNC" = "true" ]; then
        mkdir -p "$SERVER/BepInEx" "$SERVER/EscapeFromTarkov_Data"
        chown -R "$PUID:$PGID" "$SERVER/BepInEx" "$SERVER/EscapeFromTarkov_Data"
        echo "ModSync scaffold ready (BepInEx/ + empty EscapeFromTarkov_Data/ at game root)"
    else
        rm -rf "$SERVER/BepInEx" "$SERVER/EscapeFromTarkov_Data"
        echo "ModSync off — removed game-root BepInEx/ (client scaffold not needed)"
    fi
}

# Make the server bind to all interfaces (needed for LAN / Fika clients).
listen_all_networks() {
    local http="$SPT_DIR/SPT_Data/configs/http.json"
    if [ "$LISTEN_ALL_NETWORKS" = "true" ] && [ -f "$http" ]; then
        local patched
        patched="$(jq '.ip = "0.0.0.0" | .backendIp = "0.0.0.0"' "$http")" \
            && printf '%s' "$patched" > "$http"
        echo "Server set to listen on all networks (0.0.0.0)"
    fi
}

# Phase 2 installers: Fika server mod + ModSync. Each script is env-driven and no-ops
# when its feature is off. They run as root, so re-own the mount afterwards — the mount
# always ends up PUID:PGID, never root (prevents undeletable files).
run_installers() {
    /opt/scripts/install_fika.sh "$SERVER"
    /opt/scripts/install_modsync.sh "$SERVER"
    chown -R "$PUID:$PGID" "$SERVER"
}

run_server() {
    cd "$SPT_DIR"   # cwd = <gameRoot>/SPT, so ModSync's "../" paths reach the game root
    case "$SPT_MAJOR" in
        4) set -- dotnet "$SPT_DIR/SPT.Server.dll" ;;   # 4.0: framework-dependent C# build
        3) set -- "$SPT_DIR/SPT.Server.exe" ;;          # 3.11: pkg Node bundle (UNVERIFIED)
        *) echo "FATAL: unsupported SPT_MAJOR=$SPT_MAJOR" >&2; exit 1 ;;
    esac

    echo "Starting SPT $SPT_MAJOR server as $USER_NAME:$GROUP_NAME"
    if [ "$VERBOSE_LOGS" = "true" ]; then
        exec gosu "$USER_NAME:$GROUP_NAME" "$@"
    else
        # Filter the high-frequency request spam; keep everything else.
        echo "Log filtering on (set VERBOSE_LOGS=true to disable)"
        exec gosu "$USER_NAME:$GROUP_NAME" "$@" 2>&1 | grep --line-buffered -Ev \
            -e '/client/game/keepalive' -e '/launcher/ping' \
            -e '/fika/api/items' -e '/fika/api/heartbeat'
    fi
}

banner
setup_user_and_group
seed_server
gate_modsync_scaffold
listen_all_networks
run_installers
run_server
