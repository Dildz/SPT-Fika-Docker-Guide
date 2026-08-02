# SPT-Fika-Docker

**Self-host a co-op [Escape from Tarkov](https://www.escapefromtarkov.com/) server — [SPT](https://sp-tarkov.com/) + [Fika](https://project-fika.com/) — in Docker, on x86 _or_ ARM.**

Two pieces that work together:

- 🌐 **A web configurator** — pick your options in a browser, download a ready-to-run bundle (`docker-compose.yml` + `.env`), and `docker compose up -d`. No hand-editing YAML.
- 🐳 **A multi-arch Docker image** — SPT 4.0 built from source for `linux/amd64` **and** `linux/arm64` (so it runs on a normal VPS, an Oracle Ampere free-tier box, or a Raspberry Pi 4/5). Fika, ModSync, extra mods, headless, and the Fika web app are all driven by environment variables.

> ### 👉 Try the configurator: **https://strato-vps.duckdns.org/sptfikadeploy/**
> _(temporary home — a dedicated domain is coming)_

[![image](https://img.shields.io/badge/ghcr.io-dildz%2Fspt--fika--server-blue?logo=docker)](https://github.com/Dildz/SPT-Fika-Docker-Guide/pkgs/container/spt-fika-server)
![arch](https://img.shields.io/badge/arch-amd64%20%2B%20arm64-success)
[![license](https://img.shields.io/badge/license-GPL--3.0-lightgrey)](LICENSE)

---

## What you get

| Feature | How |
|---|---|
| **SPT 4.0 server** | Compiled from [`sp-tarkov/server-csharp`](https://github.com/sp-tarkov/server-csharp) at build time → native binary per architecture. |
| **Fika co-op** | The [Fika server mod](https://github.com/project-fika/Fika-Server-CSharp) installs on first boot (`INSTALL_FIKA=true`). |
| **ModSync** | Optional — installs [Dildz/ModSync-for-SPT4.0](https://github.com/Dildz/ModSync-for-SPT4.0) so clients auto-sync your server's mods (`USE_MODSYNC=true`). |
| **Quartermaster** | Optional web UI (`quma`) to install / update / remove server mods from SPT Forge. |
| **Headless client** | Optional dedicated raid host (x86 only — runs a real SPT client). |
| **Fika web app** | Optional browser admin UI ([`lacyway/fikawebapp`](https://hub.docker.com/r/lacyway/fikawebapp)). |
| **Sensible defaults** | Runs as your `PUID`/`PGID`, owns its data dir cleanly (no root-owned files), self-signed HTTPS, healthcheck. |

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

The image is published to GHCR (multi-arch — Docker pulls the right one for your CPU automatically):

```yaml
services:
  spt-fika:
    image: ghcr.io/dildz/spt-fika-server:4.0.13   # or :latest
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
      - ./server-data:/opt/server
```

```bash
docker compose up -d && docker compose logs -f
```

---

## Configuration

Everything is environment-driven. The full, authoritative list is in **[docs/env-vars.md](docs/env-vars.md)**. The ones you'll touch most:

| Var | Default | Does |
|---|---|---|
| `PUID` / `PGID` | `1000` | UID/GID the server runs as and owns its data dir. |
| `LISTEN_ALL_NETWORKS` | `false` | `true` binds `0.0.0.0` (LAN / remote / Fika clients). |
| `INSTALL_FIKA` | `true` | Install the Fika server mod on first boot. |
| `FIKA_VERSION` | `2.3.2` | Fika server release to install. |
| `USE_MODSYNC` | `false` | Install ModSync so clients sync your modset. |
| `NUM_HEADLESS_PROFILES` | _(unset)_ | Number of headless profiles for the server to create. |

### How players connect

Players install **vanilla SPT** + the **Fika client plugin** + (optionally) **ModSync**. If you run ModSync, it then syncs the rest of your server's mods to them automatically — so you only manage mods in one place: the server.

---

## Updating

The image pins a specific SPT version, but **most updates don't need a new image**:

- **Fika / ModSync / extra mods** are installed at boot from env vars — bump `FIKA_VERSION` (etc.) and `docker compose up -d`. **No rebuild.**
- **SPT itself** is compiled into the image, so a new SPT means a new image tag. Just pull it: `docker compose pull && docker compose up -d`.

New image tags are published automatically by CI ([`.github/workflows/build-image.yml`](.github/workflows/build-image.yml)) — it builds amd64 + arm64 on native runners and pushes one multi-arch tag to GHCR.

---

## Architecture support

Built from source per-architecture, so it runs natively on:

- 🖥️ **x86-64** — any normal server / VPS.
- 💪 **ARM64** — Oracle Cloud Ampere (free tier), Raspberry Pi 4 / 5, other aarch64 hosts. _Verified booting on real ARM hardware._

> The **headless client** is x86-only (it runs a real EFT client under wine).

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
# 4.1 — derives from the official image; SPT_VERSION is an upstream server-csharp tag
docker build image-4.1/ -t spt-fika-server-4.1:4.1.0 --build-arg SPT_VERSION=4.1.0

# 4.0 — builds SPT from source
docker build image-4.0/ -t spt-fika-server:4.0.13 \
    --build-arg SPT_MAJOR=4 --build-arg SPT_VERSION=4.0.13
```
`SPT_VERSION` must be a valid [`sp-tarkov/server-csharp`](https://github.com/sp-tarkov/server-csharp) tag. The 4.0 ModSync installer has an offline self-check: `bash image-4.0/scripts/test_modsync.sh`.

---

## Requirements & disclaimer

- You must **own Escape from Tarkov**. SPT / Fika do not include game assets.
- This is for **private, co-op play**. Not affiliated with Battlestate Games.

## Credits

- Original Docker guide by **[OnniSaarni](https://github.com/OnniSaarni)** — this repo grew out of it.
- [**SPT**](https://github.com/sp-tarkov) (Single Player Tarkov) and [**Fika**](https://github.com/project-fika) (co-op) — the projects that make this possible.
- [**zhliau/fika-spt-server-docker**](https://github.com/zhliau/fika-spt-server-docker) — prior art for running Fika and the headless client in Docker.
- [**Outshynd**](https://github.com/Outshynd) — the build-from-source SPT server + clean wine headless approach that shaped this image.

If this saved you a headache, you can [buy me a coffee ☕](https://ko-fi.com/dildz).

## License

[GPL-3.0](LICENSE)
