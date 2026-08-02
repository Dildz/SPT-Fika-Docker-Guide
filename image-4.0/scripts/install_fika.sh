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

install_server_mod() {   # project-fika/Fika-Server-CSharp → SPT/user/mods/fika-server
    echo "Installing Fika server mod v${FIKA_VERSION}"
    local t; t="$(fetch_zip "https://github.com/project-fika/Fika-Server-CSharp/releases/download/v${FIKA_VERSION}/Fika.Server.Release.${FIKA_VERSION}.zip")"
    mkdir -p "$SPT/user/mods"; rm -rf "$mod_dir"
    mv "$t/x/SPT/user/mods/fika-server" "$SPT/user/mods/"
    rm -rf "$t"; echo "Fika server mod installed"
}

install_client_plugin() {   # project-fika/Fika-Plugin → BepInEx/plugins/Fika (merge; leaves Fika.Headless.dll intact)
    echo "Installing Fika client plugin v${FIKA_VERSION} (ModSync serves it to clients)"
    local t; t="$(fetch_zip "https://github.com/project-fika/Fika-Plugin/releases/download/v${FIKA_VERSION}/Fika.Release.${FIKA_VERSION}.zip")"
    mkdir -p "$fika_plugin_dir"
    cp -a "$t/x/BepInEx/plugins/Fika/." "$fika_plugin_dir/"
    rm -rf "$t"; echo "Fika client plugin installed"
}

install_headless_plugin() {   # project-fika/Fika-Headless → BepInEx/plugins/Fika/Fika.Headless.dll
    echo "Installing Fika headless plugin v${FIKA_HEADLESS_VERSION} (ModSync serves it to the headless)"
    local t; t="$(fetch_zip "https://github.com/project-fika/Fika-Headless/releases/download/v${FIKA_HEADLESS_VERSION}/Fika.Headless.${FIKA_HEADLESS_VERSION}.zip")"
    mkdir -p "$fika_plugin_dir"
    cp -f "$t/x/BepInEx/plugins/Fika/Fika.Headless.dll" "$fika_plugin_dir/"
    rm -rf "$t"; echo "Fika headless plugin installed"
}

# ---- 1. server mod (always) — preserve fika.jsonc across an auto-update ----
if [ ! -d "$mod_dir" ]; then
    install_server_mod
elif [ "$AUTO_UPDATE_FIKA" = "true" ]; then
    echo "AUTO_UPDATE_FIKA=true — reinstalling Fika server mod v${FIKA_VERSION}, preserving config"
    saved=""; [ -f "$mod_dir/$config_rel" ] && { saved="$(mktemp)"; cp "$mod_dir/$config_rel" "$saved"; }
    install_server_mod
    [ -n "$saved" ] && { mkdir -p "$mod_dir/$(dirname "$config_rel")"; cp "$saved" "$mod_dir/$config_rel"; rm -f "$saved"; }
else
    echo "Fika server mod already installed (set AUTO_UPDATE_FIKA=true to reinstall v${FIKA_VERSION})"
fi

# ---- 2. client plugin (only when ModSync serves clients) ----
if [ "$USE_MODSYNC" = "true" ]; then
    if [ ! -f "$fika_plugin_dir/Fika.Core.dll" ] || [ "$AUTO_UPDATE_FIKA" = "true" ]; then
        install_client_plugin
    else
        echo "Fika client plugin already installed (v pinned to FIKA_VERSION=${FIKA_VERSION})"
    fi
fi

# ---- 3. headless plugin (only when a headless is in play + ModSync serves it) ----
if [ "$USE_MODSYNC" = "true" ] && [ -n "$FIKA_HEADLESS_VERSION" ]; then
    if [ ! -f "$fika_plugin_dir/Fika.Headless.dll" ] || [ "$AUTO_UPDATE_FIKA" = "true" ]; then
        install_headless_plugin
    else
        echo "Fika headless plugin already installed (FIKA_HEADLESS_VERSION=${FIKA_HEADLESS_VERSION})"
    fi
fi

# Optional: set headless profile count. ponytail: jq treats the .jsonc as plain JSON
# (mirrors zhliau); if Fika ever ships real comments in fika.jsonc, swap to a jsonc parser.
if [ -n "$NUM_HEADLESS_PROFILES" ] && [ -f "$mod_dir/$config_rel" ]; then
    echo "Setting headless profile amount to $NUM_HEADLESS_PROFILES"
    patched="$(jq --argjson n "$NUM_HEADLESS_PROFILES" '.headless.profiles.amount = $n' "$mod_dir/$config_rel")" \
        && printf '%s' "$patched" > "$mod_dir/$config_rel"
fi
