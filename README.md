# SPT-Fika-Docker

**Self-host a co-op [Escape from Tarkov](https://www.escapefromtarkov.com/) server — [SPT](https://sp-tushonka.com) + [Fika](https://project-fika.com/) — in Docker, on x86 _or_ ARM.**

Two pieces that work together:

- 🌐 **A web configurator** — pick your options in a browser, download a ready-to-run bundle (`docker-compose.yml` + `.env`), and `docker compose up -d`. No hand-editing YAML.
- 🐳 **Multi-arch Docker images** — one per SPT line, `linux/amd64` **and** `linux/arm64` (so they run on a normal VPS, an Oracle Ampere free-tier box, or a Raspberry Pi 4/5). Fika, ModSync, headless and the Fika web app are all driven by environment variables.

### Which SPT line?

| Line | Image | Co-op? | SPT updates? |
|---|---|---|---|
| **4.1** — newest | `ghcr.io/dildz/spt-fika-server-4.1.x` | ❌ not yet — Fika has no 4.1 build | ✅ tracks 4.1.x |
| **4.0** — the co-op line | `ghcr.io/dildz/spt-fika-server` | ✅ Fika · ModSync · headless · Quartermaster · web app | ❌ frozen at `4.0.13` |
| **3.11** — legacy | `ghcr.io/dildz/spt-fika-server-3.11.x` | ✅ Fika 2.4.8 · ModSync 0.11.1 (pinned) | ❌ frozen at `3.11.4` |

**Want to play co-op today? Pick 4.0.** It is the only line where the whole ecosystem exists. Its SPT is frozen, which only means the server itself stops changing under you — **Fika and ModSync still update normally** on it.

**Pick 4.1** if you want the newest SPT and can wait for co-op. It runs as a bare server today, and the image is ready for the mods the moment they ship.

Each line is a **separate package**, so a `docker pull` never carries you across a major version.

> ### 👉 Try the configurator: **https://strato-vps.duckdns.org/sptfikadeploy/**
> _(temporary home — a dedicated domain is coming)_

[![image](https://img.shields.io/badge/ghcr.io-dildz%2Fspt--fika--server-blue?logo=docker)](https://github.com/Dildz/SPT-Fika-Docker-Guide/pkgs/container/spt-fika-server)
![arch](https://img.shields.io/badge/arch-amd64%20%2B%20arm64-success)
[![license](https://img.shields.io/badge/license-GPL--3.0-lightgrey)](LICENSE)

---

## What you get

| Feature | How | Lines |
|---|---|---|
| **SPT server** | 4.0 / 3.11 compiled from source at build time → native binary per architecture. 4.1 derives from the [official SPT image](https://github.com/SP-Tushonka/server-csharp), which is already multi-arch. | all |
| **Game-root mount** | The bind mount **is** the game root — the server runs from a subfolder (`SPT/` on 4.0, `SPT_Runtime/` on 4.1), so client-file mods write inside the mount and survive a container recreate. | 4.0 · 4.1 |
| **Fika co-op** | The [Fika server mod](https://github.com/project-fika/Fika-Server-CSharp) installs on first boot (`INSTALL_FIKA=true`). | 4.0 · 3.11 |
| **ModSync** | Optional — installs [Dildz/ModSync-for-SPT4](https://github.com/Dildz/ModSync-for-SPT4) so clients auto-sync your server's mods (`USE_MODSYNC=true`). 3.11 uses Corter's original. | 4.0 · 3.11 |
| **Quartermaster** | Optional web UI (`quma`) to install / update / remove server mods from SPT Forge. | 4.0 |
| **Headless client** | Optional dedicated raid host (x86 only — runs a real SPT client). | 4.0 |
| **Fika web app** | Optional browser admin UI ([`lacyway/fikawebapp`](https://hub.docker.com/r/lacyway/fikawebapp)). | 4.0 |
| **Sensible defaults** | Runs as your `PUID`/`PGID`, owns its data dir cleanly (no root-owned files), self-signed HTTPS, healthcheck. | all |

---

## Quick start

### The easy way — use the configurator

1. Open **[the configurator](https://strato-vps.duckdns.org/sptfikadeploy/)**.
2. Set your options (server name, ports, Fika, ModSync, headless, web app…).
3. Download the bundle and drop it on your server.
4. Run it:
   ```bash
   docker compose up -d --wait   # --wait if you enabled the healthcheck (so headless/webapp start after the server is ready)
   docker compose logs -f
   ```

That's it — Docker creates and seeds the data directory for you. No manual folder setup.

### The manual way — pull the image

The images are published to GHCR (multi-arch — Docker pulls the right one for your CPU automatically).

**SPT 4.0 — co-op:**

```yaml
services:
  spt-fika:
    image: ghcr.io/dildz/spt-fika-server:4.0.13   # :latest is pinned here permanently
    container_name: spt-fika
    restart: unless-stopped
    environment:
      PUID: 1000
      PGID: 1000
      LISTEN_ALL_NETWORKS: "true"   # bind 0.0.0.0 — needed for LAN / remote clients
      INSTALL_FIKA: "true"
    ports:
      - "6969:6969"
    volumes:
      - ./server-data:/opt/server   # this IS the game root
```

**SPT 4.1 — newest, bare server (no Fika yet):**

```yaml
services:
  spt-4.1:
    image: ghcr.io/dildz/spt-fika-server-4.1.x:4.1.1   # or :latest
    container_name: spt-4.1
    restart: unless-stopped
    environment:
      PUID: 1000
      PGID: 1000
      LISTEN_ALL_NETWORKS: "true"
      # SPT_BACKEND_IP: "203.0.113.10"   # only if clients need a specific advertised address
    ports:
      - "6969:6969"
    volumes:
      - ./server-data:/opt/server   # game root; server lives in ./server-data/SPT_Runtime
```

```bash
docker compose up -d && docker compose logs -f
```

---

## Configuration

Everything is environment-driven. The full, authoritative list is in **[docs/env-vars.md](docs/env-vars.md)**. The ones you'll touch most:

| Var | Default | Does | Lines |
|---|---|---|---|
| `PUID` / `PGID` | `1000` | UID/GID the server runs as and owns its data dir. | all |
| `LISTEN_ALL_NETWORKS` | `false` | `true` binds `0.0.0.0` (LAN / remote / Fika clients). | all |
| `VERBOSE_LOGS` | `true` | `false` filters keepalive/ping log spam. | all |
| `SPT_BACKEND_IP` | _(unset)_ | Address the server **advertises** to clients. Leave unset unless they need a specific one. | 4.1 |
| `INSTALL_FIKA` | `true` | Install the Fika server mod on first boot. | 4.0 · 3.11 |
| `FIKA_VERSION` | `2.3.2` | Fika server release to install. | 4.0 · 3.11 |
| `USE_MODSYNC` | `false` | Install ModSync so clients sync your modset. | 4.0 · 3.11 |
| `AUTO_UPDATE_FIKA` / `AUTO_UPDATE_MODSYNC` | `false` | Reinstall the pinned version on boot, keeping your config. | 4.0 |
| `NUM_HEADLESS_PROFILES` | _(unset)_ | Number of headless profiles for the server to create. | 4.0 |

### How players connect

Players install **vanilla SPT** + the **Fika client plugin** + (optionally) **ModSync**. If you run ModSync, it then syncs the rest of your server's mods to them automatically — so you only manage mods in one place: the server.

---

## Updating

Each image pins a specific SPT version, but **most updates don't need a new image**:

- **Fika / ModSync** are installed at boot from env vars — bump `FIKA_VERSION` (etc.) and `docker compose up -d`. **No rebuild.**
- **SPT itself** is baked into the image, so a new SPT means a new image tag: `docker compose pull && docker compose up -d`.

**Frozen lines never get a new SPT tag.** 4.0 stays at `4.0.13` and 3.11 at `3.11.4` — permanently, `:latest` included. That is deliberate: a frozen server is a stable base, and nobody gets moved across a major version by a routine `pull`. On 4.0, **Fika and ModSync keep updating** through the `AUTO_UPDATE_*` knobs; 3.11 is pinned all the way down.

New tags are published by CI — one workflow per line (`build-image-{4.1,4.0,3.11}.yml`), each building amd64 + arm64 on native runners and pushing one multi-arch tag to GHCR.

---

## Architecture support

Native per-architecture builds — no emulation — so it runs on:

- 🖥️ **x86-64** — any normal server / VPS.
- 💪 **ARM64** — Oracle Cloud Ampere (free tier), Raspberry Pi 4 / 5, other aarch64 hosts. _Verified booting on real ARM hardware._

> The **headless client** is x86-only (it runs a real EFT client under wine), and exists only on the 4.0 line.

---

## Repo layout

| Path | What |
|---|---|
| [`image-4.1/`](image-4.1/) | **SPT 4.1** image — derived from the official server image, re-laid-out to the game-root mount. Bare server (no mods yet). |
| [`image-4.0/`](image-4.0/) | **SPT 4.0** image (frozen at 4.0.13) — `Dockerfile`, `init-server.sh`, `scripts/` (Fika / ModSync installers). |
| [`image-3.11/`](image-3.11/) | **SPT 3.11** image (frozen at 3.11.4) — self-contained, flat layout. |
| [`configurator/`](configurator/) | The web configurator — a static single-page app (plain HTML/CSS/JS, no build). |
| [`docs/`](docs/) | The env-var contract and operations notes. |
| [`DESIGN.md`](DESIGN.md) | Architecture and the phased build plan. |
| [`.github/workflows/`](.github/workflows/) | CI: multi-arch image build + publish to GHCR (one workflow per SPT line). |

Each SPT line is its own package, so a pull never moves you across a major version:
`spt-fika-server-4.1.x` (living) · `spt-fika-server` (frozen at 4.0.13, including `:latest`) ·
`spt-fika-server-3.11.x` (frozen at 3.11.4). See [`docs/env-vars.md`](docs/env-vars.md#which-image-for-which-spt).

### Building an image yourself

```bash
# 4.1 — derives from the official image; SPT_VERSION is an upstream server-csharp tag,
# SPT_RELEASE the release-archive id for the client scaffold. Bump both together.
docker build image-4.1/ -t spt-fika-server-4.1:4.1.1 \
    --build-arg SPT_VERSION=4.1.1 --build-arg SPT_RELEASE=4.1.1-40743-e18bd1e

# 4.0 — builds SPT from source
docker build image-4.0/ -t spt-fika-server:4.0.13 \
    --build-arg SPT_MAJOR=4 --build-arg SPT_VERSION=4.0.13
```
`SPT_VERSION` must be a valid [`SP-Tushonka/server-csharp`](https://github.com/SP-Tushonka/server-csharp) tag for the 4.1 line (upstream moved orgs after 4.1.2); the frozen 4.0 line still uses `sp-tarkov/server-csharp`. The 4.0 ModSync installer has an offline self-check: `bash image-4.0/scripts/test_modsync.sh`.

---

## Requirements & disclaimer

- You must **own Escape from Tarkov**. SPT / Fika do not include game assets.
- This is for **private, co-op play**. Not affiliated with Battlestate Games.

## Credits

- Original Docker guide by **[OnniSaarni](https://github.com/OnniSaarni)** — this repo grew out of it.
- [**SPT**](https://github.com/sp-tarkov) (Single Player Tarkov), continued by [**SP-Tushonka**](https://github.com/SP-Tushonka) from 4.1.3 onward, and [**Fika**](https://github.com/project-fika) (co-op) — the projects that make this possible.
- [**zhliau/fika-spt-server-docker**](https://github.com/zhliau/fika-spt-server-docker) — prior art for running Fika and the headless client in Docker.
- [**Outshynd**](https://github.com/Outshynd) — the build-from-source SPT server + clean wine headless approach that shaped this image.

If this saved you a headache, you can [buy me a coffee ☕](https://ko-fi.com/dildz).

## License

[GPL-3.0](LICENSE)
