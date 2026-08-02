#!/bin/bash
set -e
#
# Install / update Fika. Env-driven; runs each boot. Up to three parts:
#   1. server mod    → SPT/user/mods/fika-server                (always — INSTALL_FIKA)
#   2. client plugin → BepInEx/plugins/Fika (Fika.Core.dll)     (USE_MODSYNC — ModSync serves it to players AND headless)
#   3. headless dll  → BepInEx/plugins/Fika/Fika.Headless.dll   (USE_MODSYNC + FIKA_HEADLESS_VERSION — ModSync serves it to the headless only)
#
# The client/headless plugins live at the game root because that's ModSync's staging
# area. Fika.Headless.dll must be kept off regular players — the ModSync config excludes
# it for players while its headlessIncludes still syncs it to the headless.
#
# Called from init-server.sh as: install_fika.sh <game-root>
# Contract: docs/env-vars.md (INSTALL_FIKA, FIKA_VERSION, FIKA_HEADLESS_VERSION,
#           AUTO_UPDATE_FIKA, USE_MODSYNC, NUM_HEADLESS_PROFILES)

ROOT="${1:?game root required}"
SPT="$ROOT/SPT"                                  # the SPT server install lives in <root>/SPT
INSTALL_FIKA="${INSTALL_FIKA:-true}"
FIKA_VERSION="${FIKA_VERSION:-2.3.2}"
FIKA_HEADLESS_VERSION="${FIKA_HEADLESS_VERSION:-}"   # set (by the configurator) only when headless + ModSync
AUTO_UPDATE_FIKA="${AUTO_UPDATE_FIKA:-false}"
USE_MODSYNC="${USE_MODSYNC:-false}"

[ "$INSTALL_FIKA" = "true" ] || { echo "Fika install disabled (INSTALL_FIKA=false)"; exit 0; }

mod_dir="$SPT/user/mods/fika-server"
config_rel="assets/configs/fika.jsonc"
fika_plugin_dir="$ROOT/BepInEx/plugins/Fika"

# Download <url> and extract into a fresh temp dir; echoes the temp path (dir "x" holds
# the extracted tree). Fails loud (set -e) if the download or unzip fails.
fetch_zip() {   # <url>
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL "$1" -o "$tmp/a.zip"
    unzip -q "$tmp/a.zip" -d "$tmp/x"
    echo "$tmp"
}

# Paths inside the mod dir that belong to the admin, not to the release zip, and so must
# survive a version change. fika.jsonc is the config; database/ is Fika's runtime state
# (playerRelations.json, friendRequests.json) — a mod update has no business resetting
# players' friend lists.
PRESERVE=("$config_rel" "database")

install_server_mod() {   # project-fika/Fika-Server-CSharp → SPT/user/mods/fika-server
    echo "Installing Fika server mod v${FIKA_VERSION}"
    local t; t="$(fetch_zip "${FIKA_SERVER_URL:-https://github.com/project-fika/Fika-Server-CSharp/releases/download/v${FIKA_VERSION}/Fika.Server.Release.${FIKA_VERSION}.zip}")"
    # Stash the admin's files, replace the mod wholesale, put them back. On a fresh
    # install there is nothing to stash and this costs one empty temp dir.
    local stash; stash="$(mktemp -d)"
    local p
    for p in "${PRESERVE[@]}"; do
        [ -e "$mod_dir/$p" ] && { mkdir -p "$stash/$(dirname "$p")"; cp -a "$mod_dir/$p" "$stash/$p"; }
    done
    mkdir -p "$SPT/user/mods"; rm -rf "$mod_dir"
    mv "$t/x/SPT/user/mods/fika-server" "$SPT/user/mods/"
    for p in "${PRESERVE[@]}"; do
        [ -e "$stash/$p" ] && { mkdir -p "$mod_dir/$(dirname "$p")"; cp -a "$stash/$p" "$mod_dir/$(dirname "$p")/"; echo "  kept existing $p"; }
    done
    rm -rf "$t" "$stash"; echo "Fika server mod installed"
}

install_client_plugin() {   # project-fika/Fika-Plugin → BepInEx/plugins/Fika (merge; leaves Fika.Headless.dll intact)
    echo "Installing Fika client plugin v${FIKA_VERSION} (ModSync serves it to clients)"
    local t; t="$(fetch_zip "${FIKA_PLUGIN_URL:-https://github.com/project-fika/Fika-Plugin/releases/download/v${FIKA_VERSION}/Fika.Release.${FIKA_VERSION}.zip}")"
    mkdir -p "$fika_plugin_dir"
    cp -a "$t/x/BepInEx/plugins/Fika/." "$fika_plugin_dir/"
    rm -rf "$t"; echo "Fika client plugin installed"
}

install_headless_plugin() {   # project-fika/Fika-Headless → BepInEx/plugins/Fika/Fika.Headless.dll
    echo "Installing Fika headless plugin v${FIKA_HEADLESS_VERSION} (ModSync serves it to the headless)"
    local t; t="$(fetch_zip "${FIKA_HEADLESS_URL:-https://github.com/project-fika/Fika-Headless/releases/download/v${FIKA_HEADLESS_VERSION}/Fika.Headless.${FIKA_HEADLESS_VERSION}.zip}")"
    mkdir -p "$fika_plugin_dir"
    cp -f "$t/x/BepInEx/plugins/Fika/Fika.Headless.dll" "$fika_plugin_dir/"
    rm -rf "$t"; echo "Fika headless plugin installed"
}

# ---- version tracking --------------------------------------------------------
# SPT 4.0 mods are C# — there is no package.json to read an installed version from — so
# the installer records what it put there and compares against the pin next boot.
#
# Without this, AUTO_UPDATE_FIKA meant "re-download and re-extract on EVERY boot", even
# when the installed version already matched. That churned the mod directory, discarded
# anything not explicitly preserved, and made a successful boot depend on GitHub being
# reachable. It updates when the pinned version CHANGES, which is what the name implies.
#
# ensure_part <label> <marker> <wanted> <sentinel> <install-fn>
#   sentinel missing        → fresh install
#   marker missing          → adopt: an install predating version tracking, or one the
#                             admin made by hand. We cannot read its real version, so
#                             wiping a working install to "correct" an unverifiable
#                             version would cost more than it buys. Bump the pinned
#                             version to force an update.
#   marker == wanted        → nothing to do
#   marker != wanted        → update, but only with AUTO_UPDATE_FIKA=true
ensure_part() {
    local label="$1" marker="$2" want="$3" sentinel="$4" fn="$5"
    if [ ! -e "$sentinel" ]; then
        "$fn"; echo "$want" > "$marker"
    elif [ ! -f "$marker" ]; then
        echo "$want" > "$marker"
        echo "${label} present but untracked — adopting as v${want} (bump the version to force an update)"
    elif [ "$(cat "$marker")" = "$want" ]; then
        echo "${label} v${want} already current — nothing to do"
    elif [ "$AUTO_UPDATE_FIKA" = "true" ]; then
        echo "Updating ${label}: v$(cat "$marker") → v${want}"
        "$fn"; echo "$want" > "$marker"
    else
        echo "${label} v$(cat "$marker") installed but v${want} pinned — set AUTO_UPDATE_FIKA=true to update"
    fi
}

# ---- 1. server mod (always) ----
ensure_part "Fika server mod" "$mod_dir/.installed-version" "$FIKA_VERSION" \
            "$mod_dir" install_server_mod

# ---- 2. client plugin (only when ModSync serves clients) ----
if [ "$USE_MODSYNC" = "true" ]; then
    ensure_part "Fika client plugin" "$fika_plugin_dir/.client-version" "$FIKA_VERSION" \
                "$fika_plugin_dir/Fika.Core.dll" install_client_plugin
fi

# ---- 3. headless plugin (only when a headless is in play + ModSync serves it) ----
if [ "$USE_MODSYNC" = "true" ] && [ -n "$FIKA_HEADLESS_VERSION" ]; then
    ensure_part "Fika headless plugin" "$fika_plugin_dir/.headless-version" "$FIKA_HEADLESS_VERSION" \
                "$fika_plugin_dir/Fika.Headless.dll" install_headless_plugin
fi

# Optional: set headless profile count. ponytail: jq treats the .jsonc as plain JSON
# (mirrors zhliau); if Fika ever ships real comments in fika.jsonc, swap to a jsonc parser.
if [ -n "$NUM_HEADLESS_PROFILES" ] && [ -f "$mod_dir/$config_rel" ]; then
    echo "Setting headless profile amount to $NUM_HEADLESS_PROFILES"
    patched="$(jq --argjson n "$NUM_HEADLESS_PROFILES" '.headless.profiles.amount = $n' "$mod_dir/$config_rel")" \
        && printf '%s' "$patched" > "$mod_dir/$config_rel"
fi
