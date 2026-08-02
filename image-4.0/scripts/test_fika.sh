#!/bin/bash
# Offline check for install_fika.sh: the version-gating decision table, and what a
# version change is allowed to destroy.
#
# The behaviour under test is the fix for AUTO_UPDATE_FIKA reinstalling on EVERY boot
# regardless of the installed version — which churned the mod dir, made booting depend
# on GitHub being reachable, and quietly reset anything the release zip also ships:
# the launcher background, and Fika's database/ (players' friend lists).
#
# Run: ./test_fika.sh   (needs 7z to build fixtures; no network — URLs use file://)
set -e
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $1"; exit 1; }

# ---- fixture release zips, shaped like the real ones ----
s="$work/src"
mkdir -p "$s/SPT/user/mods/fika-server/assets/configs" \
         "$s/SPT/user/mods/fika-server/assets/images/launcher" \
         "$s/SPT/user/mods/fika-server/database"
echo srv                  > "$s/SPT/user/mods/fika-server/FikaServer.dll"
echo '{"stock":true}'     > "$s/SPT/user/mods/fika-server/assets/configs/fika.jsonc"
echo stock-bg             > "$s/SPT/user/mods/fika-server/assets/images/launcher/bg.png"
echo '{}'                 > "$s/SPT/user/mods/fika-server/database/playerRelations.json"
( cd "$s" && 7z a -tzip -bso0 "$work/server.zip" . >/dev/null )

c="$work/client"; mkdir -p "$c/BepInEx/plugins/Fika"
echo core > "$c/BepInEx/plugins/Fika/Fika.Core.dll"
( cd "$c" && 7z a -tzip -bso0 "$work/client.zip" . >/dev/null )

h="$work/hl"; mkdir -p "$h/BepInEx/plugins/Fika"
echo hl > "$h/BepInEx/plugins/Fika/Fika.Headless.dll"
( cd "$h" && 7z a -tzip -bso0 "$work/headless.zip" . >/dev/null )

ROOT="$work/root"; mkdir -p "$ROOT"
mod="$ROOT/SPT/user/mods/fika-server"
fika() { INSTALL_FIKA=true USE_MODSYNC=true \
         FIKA_SERVER_URL="file://$work/server.zip" \
         FIKA_PLUGIN_URL="file://$work/client.zip" \
         FIKA_HEADLESS_URL="file://$work/headless.zip" \
         "$here/install_fika.sh" "$ROOT" "$@"; }

# A reinstall rm -rf's the mod dir, so a canary file that survives proves nothing ran.
canary() { touch "$mod/.canary"; }
reinstalled() { [ ! -f "$mod/.canary" ]; }
ver() { cat "$mod/.installed-version" 2>/dev/null; }

# 1. fresh install
FIKA_VERSION=2.3.5 fika >/dev/null
[ -f "$mod/FikaServer.dll" ]                      || fail "server mod not installed"
[ -f "$ROOT/BepInEx/plugins/Fika/Fika.Core.dll" ] || fail "client plugin not staged at the game root"
[ "$(ver)" = "2.3.5" ]                            || fail "no version marker after fresh install"

# the admin's own files, which the release zip would otherwise overwrite
echo '{"mine":true}' > "$mod/assets/configs/fika.jsonc"
echo my-bg           > "$mod/assets/images/launcher/bg.png"
echo '{"a":{"friends":["b"]}}' > "$mod/database/playerRelations.json"

# 2. same version + auto-update ON → must NOT reinstall (the bug being fixed)
canary
FIKA_VERSION=2.3.5 AUTO_UPDATE_FIKA=true fika >/dev/null
reinstalled && fail "reinstalled even though the pinned version was already installed"

# 3. version changed + auto-update OFF → must not touch anything
canary
FIKA_VERSION=9.9.9 AUTO_UPDATE_FIKA=false fika | grep -q "set AUTO_UPDATE_FIKA=true" \
  || fail "no hint that an update is available"
reinstalled && fail "updated while AUTO_UPDATE_FIKA=false"

# 4. version changed + auto-update ON → updates, and preserves the admin's state
canary
FIKA_VERSION=9.9.9 AUTO_UPDATE_FIKA=true fika >/dev/null
reinstalled                                    || fail "did not update when the version changed"
[ "$(ver)" = "9.9.9" ]                         || fail "marker not advanced after update"
grep -q '"mine"'  "$mod/assets/configs/fika.jsonc"        || fail "fika.jsonc clobbered on update"
grep -q 'friends' "$mod/database/playerRelations.json"    || fail "friend lists wiped on update"
# the launcher image IS shipped in the zip and is NOT preserved — assert the known
# behaviour so a future change to PRESERVE is a deliberate decision, not a surprise.
grep -q 'stock-bg' "$mod/assets/images/launcher/bg.png" \
  || fail "launcher bg unexpectedly preserved — update PRESERVE and this test together"

# 5. untracked install (no marker) → adopted, never silently wiped
rm -f "$mod/.installed-version"; canary
FIKA_VERSION=1.2.3 AUTO_UPDATE_FIKA=true fika | grep -q "adopting" || fail "untracked install not adopted"
reinstalled && fail "wiped an untracked install instead of adopting it"
[ "$(ver)" = "1.2.3" ] || fail "adoption did not record the pinned version"

# 6. the headless plugin tracks its OWN version line, not Fika's
FIKA_VERSION=1.2.3 FIKA_HEADLESS_VERSION=1.4.15 AUTO_UPDATE_FIKA=true fika >/dev/null
[ -f "$ROOT/BepInEx/plugins/Fika/Fika.Headless.dll" ] || fail "headless plugin not staged"
[ "$(cat "$ROOT/BepInEx/plugins/Fika/.headless-version")" = "1.4.15" ] || fail "headless version not tracked separately"

# 7. disabled = no-op
ROOT2="$work/root2"; mkdir -p "$ROOT2"
INSTALL_FIKA=false "$here/install_fika.sh" "$ROOT2" | grep -q "disabled" || fail "INSTALL_FIKA=false not skipped"
[ ! -d "$ROOT2/SPT/user/mods/fika-server" ] || fail "installed while disabled"

echo "PASS"
