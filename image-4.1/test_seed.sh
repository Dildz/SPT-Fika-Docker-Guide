#!/bin/bash
# Offline check for init-server.sh's seed/update decision table.
#
# The behaviour under test: the bind mount IS the game root, so the server binaries
# live on the host and a `docker compose pull` alone never updates SPT. seed_server()
# is the only thing that copies the new files out of the image, and it has to do that
# WITHOUT touching the admin's profiles, mods or plugins, which live in the same tree.
#
# Run: ./test_seed.sh   (no network, no docker, no root)
set -e
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail() { echo "FAIL: $1"; exit 1; }

# ---- fixtures: an "image baseline" and an empty "bind mount" ----
IMG="$work/gameroot"; SRV="$work/server"
mkdir -p "$IMG/SPT_Runtime/SPT_Data/configs" "$IMG/SPT_Runtime/user" "$IMG/BepInEx/plugins"
echo v1 > "$IMG/SPT_Runtime/SPT.Server.Linux"
echo '{"stock":true}' > "$IMG/SPT_Runtime/SPT_Data/configs/http.json"
mkdir -p "$SRV"

INIT_SERVER_LIB=1 . "$here/init-server.sh"
IMAGE_SRC="$IMG"; SERVER="$SRV"; SPT_DIR="$SRV/SPT_Runtime"; SERVER_BIN="$SPT_DIR/SPT.Server.Linux"
PUID="$(id -u)"; PGID="$(id -g)"

seed() { SPT_VERSION="$1" seed_server; }
ver()  { cat "$SRV/.spt-version" 2>/dev/null; }

# 1. first boot into an empty mount
seed 4.1.0 >/dev/null
[ -f "$SERVER_BIN" ]   || fail "server not seeded on first boot"
[ "$(ver)" = "4.1.0" ] || fail "no version marker after first boot"

# the admin's own state, which an update must not disturb
echo mine > "$SPT_DIR/user/profiles/abc.json"
echo mine > "$SRV/BepInEx/plugins/SomeMod.dll"

# 2. same version → no copy (every normal restart, incl. the 04:00 cron one)
echo v-local > "$SERVER_BIN"
seed 4.1.0 | grep -q "already installed" || fail "did not report the install as current"
[ "$(cat "$SERVER_BIN")" = "v-local" ]   || fail "re-copied server files on an unchanged version"

# 3. image ships a newer version → copy, and keep the admin's state
echo v2 > "$IMG/SPT_Runtime/SPT.Server.Linux"
seed 4.1.1 | grep -q "Updating SPT v4.1.0 → v4.1.1" || fail "no update line when the version changed"
[ "$(cat "$SERVER_BIN")" = "v2" ] || fail "new server files not copied on an update"
[ "$(ver)" = "4.1.1" ]            || fail "marker not advanced after update"
grep -q mine "$SPT_DIR/user/profiles/abc.json" || fail "profile lost on update"
grep -q mine "$SRV/BepInEx/plugins/SomeMod.dll" || fail "client plugin lost on update"

# 4. install predating the marker → refreshed, not adopted. This is the path every
#    existing 4.1 install takes on its first boot with this code; adopting instead
#    would record a version the files on disk do not have, and the update would then
#    never happen at all.
rm -f "$SRV/.spt-version"; echo v-old > "$SERVER_BIN"
seed 4.1.1 | grep -q "Untracked install" || fail "untracked install not reported"
[ "$(cat "$SERVER_BIN")" = "v2" ] || fail "untracked install not refreshed from the image"
[ "$(ver)" = "4.1.1" ]            || fail "marker not written for an untracked install"

# 5. SPT_Data configs ARE replaced by the update (SPT's own "overwrite all" advice).
#    Asserted so that changing it is a decision, not a surprise: http.json is rewritten
#    by configure_network on every boot anyway.
echo '{"mine":true}' > "$SPT_DIR/SPT_Data/configs/http.json"
seed 4.1.2 >/dev/null
grep -q stock "$SPT_DIR/SPT_Data/configs/http.json" \
  || fail "SPT_Data configs unexpectedly preserved — update this test and the ponytail note together"

echo "PASS"
