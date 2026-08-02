#!/bin/bash
set -e
#
# Install the Corter-ModSync server mod (Dildz SPT 4.0 fork) + the client files the
# server is required to serve. Env-driven; runs each boot.
# Called from init-server.sh: install_modsync.sh <game-root>
# Contract: docs/env-vars.md (USE_MODSYNC, MODSYNC_VERSION, AUTO_UPDATE_MODSYNC, MODSYNC_URL)
#
# The bind mount is the game root; the SPT server runs from <root>/SPT. The server mod
# (ModSync.Server/ModSyncMod.cs) hard-requires, RELATIVE TO ITS CWD (<root>/SPT):
#   ../ModSync.Updater.exe                                 (desktop updater it serves)
#   ../BepInEx/plugins/Corter-ModSync/Corter-ModSync.dll   (client plugin it serves)
# i.e. at the game root. We put the server mod in SPT/user/mods and the client files at
# the game root — both INSIDE the mount, so they persist and land where ModSync serves
# them. (No stash/redeploy needed: with the game-root layout the files are already
# persistent, unlike the earlier SPT-as-mount layout.)

ROOT="${1:?game root required}"
USE_MODSYNC="${USE_MODSYNC:-false}"
MODSYNC_VERSION="${MODSYNC_VERSION:-0.12.5}"
AUTO_UPDATE_MODSYNC="${AUTO_UPDATE_MODSYNC:-false}"

[ "$USE_MODSYNC" = "true" ] || { echo "ModSync disabled (USE_MODSYNC=false)"; exit 0; }

# SPT 4 only: this installs the Dildz/ModSync-for-SPT4.0 fork with the SPT-4 game-root
# layout. SPT 3.11 needs Corter's original mod and a different placement — not wired yet.
if [ "${SPT_MAJOR:-4}" != "4" ]; then
    echo "ModSync auto-install supports SPT 4 only (SPT_MAJOR=${SPT_MAJOR:-4}); skipping. For 3.11, install Corter's original ModSync via MOD_URLS."
    exit 0
fi

SPT="$ROOT/SPT"
mod_dir="$SPT/user/mods/Corter-ModSync"
config_rel="config.jsonc"
artifact="Corter-ModSync-v${MODSYNC_VERSION}.zip"
url="${MODSYNC_URL:-https://github.com/Dildz/ModSync-for-SPT4.0/releases/download/v${MODSYNC_VERSION}/${artifact}}"

install_modsync() {
    echo "Installing ModSync v${MODSYNC_VERSION}"
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL "$url" -o "$tmp/ms.zip"
    unzip -q "$tmp/ms.zip" -d "$tmp/x"

    # Server mod → SPT/user/mods, preserving an existing server config.jsonc.
    local saved=""
    [ -f "$mod_dir/$config_rel" ] && { saved="$(mktemp)"; cp "$mod_dir/$config_rel" "$saved"; }
    rm -rf "$mod_dir"; mkdir -p "$SPT/user/mods"
    cp -a "$tmp/x/SPT/user/mods/Corter-ModSync" "$SPT/user/mods/"
    [ -n "$saved" ] && { cp "$saved" "$mod_dir/$config_rel"; rm -f "$saved"; echo "  kept existing config.jsonc"; }

    # Client files → game root. Merge into BepInEx so the admin's other client mods stay.
    mkdir -p "$ROOT/BepInEx"
    cp -a "$tmp/x/BepInEx/." "$ROOT/BepInEx/"
    cp -f "$tmp/x/ModSync.Updater.exe" "$ROOT/ModSync.Updater.exe"
    rm -rf "$tmp"
    echo "ModSync installed"
}

# ---- version tracking --------------------------------------------------------
# ModSync is a C# mod with no readable version on disk, so the installer records what it
# installed and compares against the pin next boot. AUTO_UPDATE_MODSYNC previously meant
# "re-download and re-extract on EVERY boot" even when the version already matched —
# pointless churn, and it made booting depend on GitHub being up. It now means what it
# says: update when the pinned version changes.
marker="$mod_dir/.installed-version"

if [ ! -d "$mod_dir" ] || [ ! -f "$ROOT/ModSync.Updater.exe" ]; then
    # Missing entirely, or the client-side updater was lost — install regardless of the
    # auto-update setting, since a half-present ModSync serves nobody.
    install_modsync
    echo "$MODSYNC_VERSION" > "$marker"
elif [ ! -f "$marker" ]; then
    # Predates version tracking, or was installed by hand. Adopt rather than reinstall:
    # the real version cannot be read, so replacing a working install to correct an
    # unverifiable version costs more than it buys. Bump MODSYNC_VERSION to force one.
    echo "$MODSYNC_VERSION" > "$marker"
    echo "ModSync present but untracked — adopting as v${MODSYNC_VERSION} (bump the version to force an update)"
elif [ "$(cat "$marker")" = "$MODSYNC_VERSION" ]; then
    echo "ModSync v${MODSYNC_VERSION} already current — nothing to do"
elif [ "$AUTO_UPDATE_MODSYNC" = "true" ]; then
    echo "Updating ModSync: v$(cat "$marker") → v${MODSYNC_VERSION}"
    install_modsync
    echo "$MODSYNC_VERSION" > "$marker"
else
    echo "ModSync v$(cat "$marker") installed but v${MODSYNC_VERSION} pinned — set AUTO_UPDATE_MODSYNC=true to update"
fi
echo "ModSync ready: server mod in SPT/user/mods/Corter-ModSync, client files at the game root"
