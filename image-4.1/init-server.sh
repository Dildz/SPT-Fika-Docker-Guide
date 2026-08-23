#!/bin/bash
set -e
#
# SPT-FIKA-Docker entrypoint — SPT 4.1.
#
# Replaces upstream's docker/entrypoint.sh. Two reasons it exists:
#   1. LAYOUT — the bind mount is the GAME ROOT, and the server runs from <mount>/SPT/,
#      so client-file paths like "../BepInEx" resolve inside the mount (see Dockerfile).
#   2. CONTRACT — this image speaks the env vars in docs/env-vars.md (the set the web
#      configurator emits), not upstream's SPT_IP/SPT_BACKEND_IP-only set.
#
# Scope: a bare 4.1 server. No Fika, no ModSync, no mod installers — those arrive once
# they support 4.1.
# ponytail: no run_installers() here on purpose; add it back when there is something to install.

# ---- env (user-configurable) ----
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
USER_NAME="${USER_NAME:-spt}"
GROUP_NAME="${GROUP_NAME:-spt}"
VERBOSE_LOGS="${VERBOSE_LOGS:-true}"
LISTEN_ALL_NETWORKS="${LISTEN_ALL_NETWORKS:-false}"
SPT_PORT="${SPT_PORT:-6969}"
# Address the server ADVERTISES to game clients (not what it binds to). Leave unset for
# same-host play; set it to the host's reachable IP for LAN or remote clients.
SPT_BACKEND_IP="${SPT_BACKEND_IP:-}"

# ---- paths ----
# SPT 4.1 renamed the server directory from SPT/ (4.0) to SPT_Runtime/ — see
# https://wiki.sp-tushonka.com (the old sp-tarkov wiki is 410 Gone). The server itself resolves
# user/ relative to its own directory and doesn't read the name, but a real 4.1 install
# uses SPT_Runtime/, so mods and admins expect it here too.
IMAGE_SRC=/opt/gameroot          # image baseline: client scaffold + SPT_Runtime/
SERVER=/opt/server               # host bind mount — the game root (persistent)
SPT_DIR="$SERVER/SPT_Runtime"    # the SPT server install; the server runs from here
SERVER_BIN="$SPT_DIR/SPT.Server.Linux"

orange="\033[38;5;208m"; reset="\033[0m"

banner() {
    echo "========================================================="
    echo "==  SPT-FIKA-Docker  |  SPT ${SPT_VERSION:-4.1}  UID=$PUID:$PGID  =="
    echo "========================================================="
}

# Create the runtime user/group, reusing any that already own the mount.
setup_user_and_group() {
    getent group  "$PGID" >/dev/null || groupadd -g "$PGID" "$GROUP_NAME"
    getent passwd "$PUID" >/dev/null || useradd -u "$PUID" -g "$PGID" -d "$SERVER" -s /bin/sh "$USER_NAME"
    GROUP_NAME="$(getent group  "$PGID" | cut -d: -f1)"
    USER_NAME="$(getent passwd "$PUID" | cut -d: -f1)"
}

# Copy the image baseline into the bind mount, on first boot and on an SPT update.
#
# The mount is the game root, so the server binaries live on the HOST, not in the
# image. Pulling a new tag therefore does not update SPT by itself — something has to
# copy the new files out. That something is here.
#
# $MARKER records which version was copied in; SPT_VERSION says which one the image
# ships. The env var is trustworthy because the compose tag is built from it
# (image: …-4.1.x:${SPT_VERSION}), so it cannot claim a version the image isn't.
#
#   marker missing        → copy. An install predating this marker, so we cannot know
#                           what it holds; the copy is an overlay and the version we
#                           have is the one we want, so refreshing is both safe and
#                           correct. (image-4.0 adopts instead — there the install is
#                           mature and the source is a GitHub download, not a local dir.)
#   marker == SPT_VERSION → nothing to do. Every normal restart lands here.
#   marker != SPT_VERSION → the admin bumped the tag and pulled. Copy.
#
# ponytail: overlay copy, no delete pass — files upstream REMOVED linger, and
# SPT_Data/configs are replaced by the new defaults (which is what SPT's own update
# instructions say to do). user/ in the image is empty, so profiles, mods and certs
# are never touched. If a release ever needs stale files gone, diff the two trees here.
seed_server() {
    local marker="$SERVER/.spt-version"
    local installed=""
    [ -f "$marker" ] && installed="$(cat "$marker")"

    if [ -z "$(ls -A "$SERVER" 2>/dev/null)" ]; then
        echo -e "${orange}Note: $SERVER is empty — bind-mount a host dir here to persist server files.${reset}"
    fi

    if [ ! -e "$SERVER_BIN" ]; then
        echo "First boot — seeding SPT ${SPT_VERSION:-4.1} into $SERVER (mount = game root, server in SPT_Runtime/)"
        mkdir -p "$SERVER"
        cp -a "$IMAGE_SRC/." "$SERVER/"
        echo "${SPT_VERSION:-4.1}" > "$marker"
    elif [ "$installed" = "${SPT_VERSION:-4.1}" ]; then
        echo "SPT v${installed} already installed in $SPT_DIR — leaving server files as-is"
    else
        if [ -n "$installed" ]; then
            echo "Updating SPT v${installed} → v${SPT_VERSION:-4.1} in $SPT_DIR"
        else
            echo "Untracked install in $SPT_DIR — refreshing it to v${SPT_VERSION:-4.1}"
        fi
        echo "  (server files only — profiles, mods and BepInEx plugins are left alone)"
        cp -a "$IMAGE_SRC/." "$SERVER/"
        echo "${SPT_VERSION:-4.1}" > "$marker"
    fi

    mkdir -p "$SPT_DIR/user/mods" "$SPT_DIR/user/profiles" "$SPT_DIR/user/logs" "$SPT_DIR/user/certs"
    chown -R "$PUID:$PGID" "$SERVER"
}

# Bind address and the address advertised to clients live in the same config file.
# .ip        = what the server binds to    (0.0.0.0 to be reachable off-host)
# .backendIp = what clients are told to use
configure_network() {
    local http="$SPT_DIR/SPT_Data/configs/http.json"
    if [ ! -f "$http" ]; then
        echo "WARNING: $http not found — skipping network config" >&2
        return
    fi

    local filter='.port = $port | .backendPort = $port'
    [ "$LISTEN_ALL_NETWORKS" = "true" ] && filter="$filter | .ip = \"0.0.0.0\""
    if [ -n "$SPT_BACKEND_IP" ]; then
        filter="$filter | .backendIp = \$bip"
    elif [ "$LISTEN_ALL_NETWORKS" = "true" ]; then
        # No explicit advertise address — match image-4.0/ behaviour.
        filter="$filter | .backendIp = \"0.0.0.0\""
    fi

    local patched
    patched="$(jq --argjson port "$SPT_PORT" --arg bip "$SPT_BACKEND_IP" "$filter" "$http")" \
        && printf '%s' "$patched" > "$http"

    echo "Network: bind $( [ "$LISTEN_ALL_NETWORKS" = "true" ] && echo 0.0.0.0 || echo 127.0.0.1 ):${SPT_PORT}, advertising ${SPT_BACKEND_IP:-unchanged}"
}

run_server() {
    cd "$SPT_DIR"   # cwd = <gameRoot>/SPT, so "../" paths reach the game root
    # Keys and certs are written relative to HOME; point it at the persisted user dir
    # so they survive a container recreate (upstream's entrypoint does the same).
    export HOME="$SPT_DIR/user"

    echo "Starting SPT ${SPT_VERSION:-4.1} server as $USER_NAME:$GROUP_NAME"
    if [ "$VERBOSE_LOGS" = "true" ]; then
        exec gosu "$USER_NAME:$GROUP_NAME" "$SERVER_BIN"
    else
        echo "Log filtering on (set VERBOSE_LOGS=true to disable)"
        exec gosu "$USER_NAME:$GROUP_NAME" "$SERVER_BIN" 2>&1 | grep --line-buffered -Ev \
            -e '/client/game/keepalive' -e '/launcher/ping'
    fi
}

# Sourcing this file defines the functions without running them, so test_seed.sh can
# drive seed_server() against temp dirs. Any real container start executes it.
if [ "${INIT_SERVER_LIB:-}" != "1" ]; then
    banner
    setup_user_and_group
    seed_server
    configure_network
    run_server
fi
