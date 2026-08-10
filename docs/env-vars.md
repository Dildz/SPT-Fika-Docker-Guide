# Environment variables — the image contract

This is the **authoritative** list of knobs the image exposes. The web
configurator's schema (`configurator/lib/schema.ts`) mirrors this file; the
`image-4.0/` scripts are the implementation. If they disagree, **the code wins** —
fix this doc to match `init-server.sh` and `scripts/`, not the reverse.

Status legend: **live** = implemented and verified · **Phase 2** = implemented,
unverified end-to-end · **deferred** = not built yet (see bottom).

## Build-time (Docker `--build-arg`)

These bake a specific SPT into the image; you can't change them at `docker run`.
Updating SPT means building (or pulling) a new image tag.

| Arg | Default | Meaning |
|---|---|---|
| `SPT_MAJOR` | `4` | `4` = C#/.NET build (live). `3` = 3.11 Node build (verified · frozen — see note below). |
| `SPT_VERSION` | `4.0.13` | A valid tag/branch of the matching `sp-tarkov` repo (`server-csharp` for 4.x, `server` for 3.11.x). |

```
docker build image-4.0/ -t spt-fika-server:4.0.13 \
    --build-arg SPT_MAJOR=4 --build-arg SPT_VERSION=4.0.13
```

> **SPT 3.11 is a frozen image.** It's built once from `image-3.11/` (published as
> `ghcr.io/dildz/spt-fika-server-3.11.x:3.11.4`), not from `image-4.0/`. SPT, Fika and ModSync are
> pinned and there are **no auto-updates** — the `AUTO_UPDATE_FIKA` / `AUTO_UPDATE_MODSYNC` knobs
> below are 4.0-only and do nothing on 3.11 (its installers are install-once-then-skip). Two other
> differences from 4.0: `USE_MODSYNC` **works on 3.11**, installing Corter's original
> [`c-orter/ModSync`](https://github.com/c-orter/ModSync) (`MODSYNC_VERSION` default `0.11.1`); and
> 3.11 uses a **flat game-root layout** (server runs from the mount root, no `SPT/` subdir), so mods
> and ModSync's client files extract straight into the mount.

### Which image for which SPT

Each SPT line is a **separate package**, so pulling an update never moves you across a major version.

| SPT line | Folder | Package | SPT updates? |
|---|---|---|---|
| **4.1** (living) | `image-4.1/` | `ghcr.io/dildz/spt-fika-server-4.1.x:{4.1.1,latest}` | yes — new tag per SPT 4.1.x release |
| **4.0** (frozen at `4.0.13`) | `image-4.0/` | `ghcr.io/dildz/spt-fika-server:{4.0.13,latest}` | **no** — `:latest` stays on 4.0.13 permanently |
| **3.11** (frozen at `3.11.4`) | `image-3.11/` | `ghcr.io/dildz/spt-fika-server-3.11.x:3.11.4` | **no** |

> **4.0 is frozen at the SPT level only.** No further SPT rebuilds — `:latest` on the `spt-fika-server`
> package is pinned to 4.0.13 for good, so existing 4.0 servers are never jumped to 4.1 by a pull. But
> **Fika and ModSync keep updating normally** on 4.0 (`AUTO_UPDATE_FIKA` / `AUTO_UPDATE_MODSYNC` below
> both still work), because the 4.0 ModSync line is still shipping releases. This is the one place 4.0
> differs from the fully-frozen 3.11 image, where those knobs do nothing.

> **4.1 is built differently.** `image-4.1/` does not build SPT from source — it derives from the
> official `ghcr.io/sp-tarkov/server-csharp` image (already multi-arch) and only re-lays-out the
> filesystem so the bind mount is the game root, matching 4.0. Its only build-arg is `SPT_VERSION`
> (an upstream tag, e.g. `4.1.1`); there is no `SPT_MAJOR`. It ships as a **bare server** — no Fika,
> no ModSync, no mod installers — until those support 4.1, so the mod knobs below don't apply to it yet.
> It does add one var 4.0 has no equivalent for: **`SPT_BACKEND_IP`**, the address the server advertises
> to game clients (leave unset for same-host play; set it to the host's reachable IP for LAN/remote).

## Runtime — core (live)

Read by `init-server.sh` on every boot. **Applies to all three lines** unless noted.

| Var | Default | Meaning |
|---|---|---|
| `PUID` | `1000` | UID the server runs as / owns the bind mount. |
| `PGID` | `1000` | GID the server runs as. |
| `USER_NAME` | `spt` | Name for a created user (ignored if `PUID` already exists). |
| `GROUP_NAME` | `spt` | Name for a created group (ignored if `PGID` already exists). |
| `SPT_MAJOR` | baked from build | **4.0 / 3.11 only.** Picks the run command (`dotnet SPT.Server.dll` for 4, `SPT.Server.exe` for 3). Normally inherited from the image; override only to force a path. 4.1 is a single-line image and ignores it. |
| `VERBOSE_LOGS` | `true` | `false` filters high-frequency request spam (`keepalive`, `ping`, Fika `heartbeat`/`items`). |
| `LISTEN_ALL_NETWORKS` | `false` | `true` patches `http.json` to bind `0.0.0.0` (needed for LAN / Fika clients). |
| `SPT_PORT` | `6969` | Port the server binds **and advertises**, written to `http.json` as both `.port` and `.backendPort`. **Map it 1:1 in compose (`6979:6979`), never remap.** SPT builds every URL it hands a client — the websocket one included — as `<host>:<backendPort>` from this file, so publishing a different host port advertises a port nothing listens on. Added 2026-08 to all three lines; images built before then always listen on `6969`. |

### Runtime — 4.1 only

| Var | Default | Meaning |
|---|---|---|
| `SPT_BACKEND_IP` | _(unset)_ | The address the server **advertises to game clients** — not what it binds to. Leave unset for same-host play; set the host's reachable IP for LAN/remote. When unset and `LISTEN_ALL_NETWORKS=true`, it advertises `0.0.0.0`, which is what the 4.0 image has always done in production. |

> **Where the files land on 4.1.** The bind mount is the game root and the server lives in
> **`SPT_Runtime/`** (4.0 uses `SPT/` — SPT renamed it). So profiles are at
> `<mount>/SPT_Runtime/user/profiles`, server mods at `<mount>/SPT_Runtime/user/mods`, and the
> client-facing scaffold (`BepInEx/`, `EscapeFromTarkov_Data/`, doorstop, `winhttp.dll`) sits beside
> `SPT_Runtime/` at the mount root. Migrating from the official SPT image? Its volume is the
> *`user/` folder only* — that content belongs in `<mount>/SPT_Runtime/user/`, not at the mount root.

## Runtime — Fika (Phase 2)

Read by `scripts/install_fika.sh`. Runs each boot; safe on an already-set-up mount.
Installs up to three parts: the **server mod** (always), and — when `USE_MODSYNC=true`,
so ModSync serves them from the game-root `BepInEx/plugins/Fika/` — the **client plugin**
(for players + headless) and, when a headless is in play, the **headless DLL** (headless
only; ModSync's `config.jsonc` excludes it from players).

| Var | Default | Meaning |
|---|---|---|
| `INSTALL_FIKA` | `true` | Install the Fika server mod into `user/mods/fika-server` if absent. `false` skips entirely (client/headless plugins too). |
| `FIKA_VERSION` | `2.3.2` | Release tag of [`project-fika/Fika-Server-CSharp`](https://github.com/project-fika/Fika-Server-CSharp/releases) — drives **both** the server mod and (with ModSync) the [`Fika-Plugin`](https://github.com/project-fika/Fika-Plugin/releases) client plugin, same tag. |
| `FIKA_HEADLESS_VERSION` | _(unset)_ | Release tag of [`project-fika/Fika-Headless`](https://github.com/project-fika/Fika-Headless/releases) (own `1.4.x` scheme). Set only when running a headless **and** ModSync; stages `Fika.Headless.dll` for the headless to sync. Unset = not staged. |
| `AUTO_UPDATE_FIKA` | `false` | If `true`, update to `FIKA_VERSION` **when it differs from what is installed** — server mod, plus the client and headless plugins if staged. Not a reinstall-every-boot: the installer records what it put on disk (`.installed-version`) and compares, because a C# mod carries no readable version. `false` leaves existing installs alone. |
| `NUM_HEADLESS_PROFILES` | _(unset)_ | If set, writes `headless.profiles.amount` in `fika.jsonc`. Leave unset for a non-headless server. |

## Runtime — ModSync (Phase 2)

Read by `scripts/install_modsync.sh`. Installs the [Corter-ModSync](https://github.com/Dildz/ModSync-for-SPT4)
server mod (the SPT 4.0 fork) so clients keep their mods in sync with the server.

| Var | Default | Meaning |
|---|---|---|
| `USE_MODSYNC` | `false` | Install the ModSync server mod. Off by default (opt-in). This table covers the **4.0** image (Dildz's SPT4.0 fork); it's ignored (with a logged skip) if you set `SPT_MAJOR=3` here. The separate **3.11 image** has its own `USE_MODSYNC` that installs Corter's original mod — see the frozen-image note above. |
| `MODSYNC_VERSION` | `0.12.5` | Release tag (without the `v`) of `Dildz/ModSync-for-SPT4` to install. |
| `AUTO_UPDATE_MODSYNC` | `false` | If `true`, update to `MODSYNC_VERSION` **when it differs from what is installed** (same version-marker mechanism as `AUTO_UPDATE_FIKA`). `false` leaves it alone. |
| `MODSYNC_URL` | _(derived)_ | Override the release-zip URL (e.g. a self-hosted mirror, or `file://` for testing). Normally leave unset. |

**Placement note (SPT 4 specific):** the bind mount is the **game root** and the SPT server runs
from its `SPT/` subdir, so the ModSync server mod's required `../ModSync.Updater.exe` and
`../BepInEx/plugins/...` resolve at the game root — i.e. **inside the mount**, persistent. The
script puts the server mod in `SPT/user/mods/Corter-ModSync` (where your `config.jsonc` persists)
and the client files (BepInEx + updater) at the game root, merging into `BepInEx/` so your own
client mods stay — that game-root `BepInEx/` is exactly where ModSync serves them to clients.

## Not env vars — handled elsewhere

- **Profile backups.** SPT 4.0 backs profiles up natively (`SPT_Data/configs/backup.json`
  → `Saves`). We expose no `ENABLE_PROFILE_BACKUP` / cron — that reinvents a built-in
  (zhliau's image deprecated theirs for the same reason). Tune SPT's own setting in
  `SPT_Data/configs/`.

## Deferred (not built)

- **`AUTO_UPDATE_SPT`.** With build-from-source, each image *is* a pinned SPT version,
  so the normal update path is "pull a new image tag and `docker compose up -d`". A boot-time
  re-seed (back up mount → recopy `/opt/SPT` binaries + `SPT_Data`, preserve `user/`) is a real
  but separate feature with data-clobbering edge cases — left for a follow-up. `seed_server`
  currently only seeds a *fresh* mount and warns on an existing one.
