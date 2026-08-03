#!/bin/bash
set -e
#
# SPT-FIKA-Docker 3.11 entrypoint. Env-driven — same contract as the 4.0 image
# (PUID/PGID, LISTEN_ALL_NETWORKS, INSTALL_FIKA, USE_MODSYNC, MOD_URLS, etc.).
#
# SPT 3.11 runs from the GAME ROOT (flat layout — no SPT/ subdir, no ../ paths),
# so the server, its mods, and ModSync's client files all live in the mount root.

# ---- env (user-configurable) ----
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
USER_NAME="${USER_NAME:-spt}"
GROUP_NAME="${GROUP_NAME:-spt}"
VERBOSE_LOGS="${VERBOSE_LOGS:-true}"
LISTEN_ALL_NETWORKS="${LISTEN_ALL_NETWORKS:-false}"
SPT_PORT="${SPT_PORT:-6969}"

# ---- paths ----
IMAGE_SRC=/opt/SPT      # server compiled into the image (read-only baseline)
SERVER=/opt/server      # host bind mount = game root; the 3.11 server runs from here

orange="\033[38;5;208m"; reset="\033[0m"

banner() {
    echo "========================================================="
    echo "==  SPT-FIKA-Docker 3.11  |  UID=$PUID:$PGID  =="
    echo "========================================================="
}

# Create the runtime user/group, reusing any that already own the mount.
setup_user_and_group() {
    getent group  "$PGID" >/dev/null || groupadd -g "$PGID" "$GROUP_NAME"
    getent passwd "$PUID" >/dev/null || useradd -u "$PUID" -g "$PGID" -d "$SERVER" -s /bin/sh "$USER_NAME"
    GROUP_NAME="$(getent group  "$PGID" | cut -d: -f1)"
    USER_NAME="$(getent passwd "$PUID" | cut -d: -f1)"
}

# First boot: copy the image-built server into the (empty) mount so files persist.
seed_server() {
    if [ -z "$(ls -A "$SERVER" 2>/dev/null)" ]; then
        echo -e "${orange}Note: $SERVER is empty — bind-mount a host dir here to persist server files.${reset}"
    fi
    if [ ! -e "$SERVER/SPT.Server.exe" ]; then
        echo "First boot — seeding server files into $SERVER"
        mkdir -p "$SERVER"
        cp -a "$IMAGE_SRC/." "$SERVER/"
    else
        echo "Existing server files found in $SERVER"
    fi
    mkdir -p "$SERVER/user/mods" "$SERVER/user/profiles"
    chown -R "$PUID:$PGID" "$SERVER"
}

# Bind address and listening port both live in http.json.
# SPT 3.x keeps http config under SPT_Data/Server/configs/ (4.0 moved it to SPT_Data/configs/).
#
# .port/.backendPort must move TOGETHER: the server binds .port, but the URLs it hands
# clients are built as "<backendIp>:<backendPort>" (HttpServerHelper.buildUrl, which
# also feeds getWebsocketUrl). Remapping only the host side of the compose port would
# advertise a port nothing listens on, so SPT_PORT changes the port INSIDE the
# container and the compose mapping stays 1:1.
configure_network() {
    local http="$SERVER/SPT_Data/Server/configs/http.json"
    if [ ! -f "$http" ]; then
        [ "$LISTEN_ALL_NETWORKS" = "true" ] && echo "WARNING: $http not found — skipping network config" >&2
        return
    fi

    local filter='.port = $port | .backendPort = $port'
    [ "$LISTEN_ALL_NETWORKS" = "true" ] && filter="$filter | .ip = \"0.0.0.0\" | .backendIp = \"0.0.0.0\""

    local patched
    patched="$(jq --argjson port "$SPT_PORT" "$filter" "$http")" \
        && printf '%s' "$patched" > "$http"

    [ "$LISTEN_ALL_NETWORKS" = "true" ] && echo "Server set to listen on all networks (0.0.0.0)"
    [ "$SPT_PORT" != "6969" ] && echo "Server port set to $SPT_PORT (map it 1:1 in compose)"
    return 0
}

# Env-driven installers: Fika server mod, extra mods (MOD_URLS), Corter ModSync.
# Each no-ops when its feature is off. They run as root → re-own the mount after.
run_installers() {
    /opt/scripts/install_fika.sh "$SERVER"
    /opt/scripts/install_mods.sh "$SERVER"
    /opt/scripts/install_modsync.sh "$SERVER"
    chown -R "$PUID:$PGID" "$SERVER"
}

run_server() {
    cd "$SERVER"   # 3.11 server runs from the game root
    echo "Starting SPT 3.11 server as $USER_NAME:$GROUP_NAME"
    if [ "$VERBOSE_LOGS" = "true" ]; then
        exec gosu "$USER_NAME:$GROUP_NAME" "$SERVER/SPT.Server.exe"
    else
        echo "Log filtering on (set VERBOSE_LOGS=true to disable)"
        exec gosu "$USER_NAME:$GROUP_NAME" "$SERVER/SPT.Server.exe" 2>&1 | grep --line-buffered -Ev \
            -e '/client/game/keepalive' -e '/launcher/ping' \
            -e '/fika/api/items' -e '/fika/api/heartbeat'
    fi
}

banner
setup_user_and_group
seed_server
configure_network
run_installers
run_server
