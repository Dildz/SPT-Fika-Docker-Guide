#!/bin/bash
# Offline check for install_modsync.sh: verifies the SPT-4 game-root placement —
# server mod into <root>/SPT/user/mods, client files (BepInEx + updater) at the game
# root <root>, BepInEx merged (admin's other mods kept), config preserved on update,
# and SPT 3.x gated. Run: ./test_modsync.sh  (needs 7z to build the fixture; no network)
set -e
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $1"; exit 1; }

# Fixture release zip, laid out for a game root.
s="$work/src"
mkdir -p "$s/BepInEx/plugins/Corter-ModSync" "$s/BepInEx/patchers" "$s/SPT/user/mods/Corter-ModSync"
echo dll  > "$s/BepInEx/plugins/Corter-ModSync/Corter-ModSync.dll"
echo pre  > "$s/BepInEx/patchers/Corter-ModSync-Prepatch.dll"
echo srv  > "$s/SPT/user/mods/Corter-ModSync/ModSync.Server.dll"
echo '{"default":true}' > "$s/SPT/user/mods/Corter-ModSync/config.jsonc"
echo exe  > "$s/ModSync.Updater.exe"
( cd "$s" && 7z a -tzip -bso0 "$work/fixture.zip" . >/dev/null )

ROOT="$work/root"; mkdir -p "$ROOT/BepInEx/plugins"
echo admin > "$ROOT/BepInEx/plugins/AdminMod.dll"   # pre-existing admin client mod
run() { USE_MODSYNC=true MODSYNC_URL="file://$work/fixture.zip" "$here/install_modsync.sh" "$ROOT" "$@"; }

# 1. fresh install — game-root placement
run >/dev/null
[ -f "$ROOT/SPT/user/mods/Corter-ModSync/ModSync.Server.dll" ] || fail "server mod not in SPT/user/mods"
[ -f "$ROOT/SPT/user/mods/Corter-ModSync/config.jsonc" ]       || fail "config not installed"
[ -f "$ROOT/ModSync.Updater.exe" ]                             || fail "updater not at game root (../ would miss)"
[ -f "$ROOT/BepInEx/plugins/Corter-ModSync/Corter-ModSync.dll" ] || fail "client plugin not at game root"
[ -f "$ROOT/BepInEx/patchers/Corter-ModSync-Prepatch.dll" ]    || fail "headless patcher not at game root"
[ -f "$ROOT/BepInEx/plugins/AdminMod.dll" ]                    || fail "merge clobbered the admin's client mod"

# ---- version gating ----------------------------------------------------------
# AUTO_UPDATE_MODSYNC used to reinstall on EVERY boot regardless of version. A canary
# inside the mod dir detects that: a reinstall rm -rf's the directory, so if the canary
# survives, no reinstall happened.
mod="$ROOT/SPT/user/mods/Corter-ModSync"
canary() { touch "$mod/.canary"; }
reinstalled() { [ ! -f "$mod/.canary" ]; }
ver() { cat "$mod/.installed-version" 2>/dev/null; }
ms() { USE_MODSYNC=true MODSYNC_URL="file://$work/fixture.zip" "$here/install_modsync.sh" "$ROOT" "$@"; }

[ -n "$(ver)" ] || fail "fresh install did not record a version marker"

# 2. same version + auto-update ON → must NOT reinstall (this is the bug being fixed)
echo '{"mine":true}' > "$mod/config.jsonc"; canary
MODSYNC_VERSION="$(ver)" AUTO_UPDATE_MODSYNC=true ms >/dev/null
reinstalled && fail "reinstalled despite the pinned version already being installed"
grep -q '"mine"' "$mod/config.jsonc" || fail "config clobbered when nothing should have happened"

# 3. version CHANGED + auto-update OFF → must not touch anything
canary
MODSYNC_VERSION=9.9.9 AUTO_UPDATE_MODSYNC=false ms | grep -q "set AUTO_UPDATE_MODSYNC=true" || fail "no hint that an update is available"
reinstalled && fail "updated while AUTO_UPDATE_MODSYNC=false"
[ "$(ver)" != "9.9.9" ] || fail "marker moved without installing"

# 4. version CHANGED + auto-update ON → updates, keeps config and the admin's mods
canary
MODSYNC_VERSION=9.9.9 AUTO_UPDATE_MODSYNC=true ms >/dev/null
reinstalled || fail "did not update when the pinned version changed"
[ "$(ver)" = "9.9.9" ] || fail "marker not advanced after update"
grep -q '"mine"' "$mod/config.jsonc" || fail "user config clobbered on update"
[ -f "$ROOT/BepInEx/plugins/AdminMod.dll" ] || fail "admin mod lost on update"

# 5. untracked install (no marker) → adopted, never silently reinstalled
rm -f "$mod/.installed-version"; canary
MODSYNC_VERSION=1.2.3 AUTO_UPDATE_MODSYNC=true ms | grep -q "adopting" || fail "untracked install not adopted"
reinstalled && fail "wiped an untracked install instead of adopting it"
[ "$(ver)" = "1.2.3" ] || fail "adoption did not record the pinned version"

# 3. disabled = no-op
ROOT2="$work/root2"; mkdir -p "$ROOT2"
USE_MODSYNC=false "$here/install_modsync.sh" "$ROOT2" | grep -q "disabled" || fail "USE_MODSYNC=false not skipped"
[ ! -d "$ROOT2/SPT/user/mods/Corter-ModSync" ] || fail "installed while disabled"

# 4. SPT 3.x gated
ROOT3="$work/root3"; mkdir -p "$ROOT3"
USE_MODSYNC=true SPT_MAJOR=3 MODSYNC_URL="file://$work/fixture.zip" "$here/install_modsync.sh" "$ROOT3" | grep -q "SPT 4 only" || fail "SPT 3 not gated"
[ ! -d "$ROOT3/SPT/user/mods/Corter-ModSync" ] || fail "installed 4.0 mod on SPT 3"

echo "PASS"
