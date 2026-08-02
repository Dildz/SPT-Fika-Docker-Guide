# configurator/

The web configurator (Phase 3) — a **single static page** (plain HTML/CSS/JS, no
framework, no build step). It renders a tabbed form, previews the
`docker-compose.yml` + `.env` it generates live, and downloads a ready-to-run
`.zip` bundle. Nothing leaves the browser; there's no backend.

The form mirrors **[../docs/env-vars.md](../docs/env-vars.md)** — the image's
real env-var contract is the source of truth.

## Files

| File | What |
|---|---|
| `index.html` | Page layout (hero, quick-start strip, tabs + live preview, field guide, FAQ) |
| `app.js` | Line predicates, schema (the form surface), emitters (compose / `.env` / README), validation, localStorage |
| `zip.js` | Tiny store-only zip writer (browser + Node) |
| `styles.css` | Dark theme |
| `test_emit.cjs` | Offline check for the emitters + per-line gating (`node test_emit.cjs`) |
| `test_zip.cjs` | Offline check for the zip writer (`node test_zip.cjs`, needs `unzip`) |
| `deploy/` | `Dockerfile` (nginx), `docker-compose.yml`, `caddy-snippet.txt` |

## Three SPT lines

The form's option surface changes per line, because a line only offers what has a
build for it. The rules live in one place at the top of `app.js`:

| Predicate | True for | Gates |
|---|---|---|
| `isFrozen` | 4.0, 3.11 | SPT version field read-only; no Forge auto-fill |
| `modsSupported` (= **not** 4.1) | 4.0, 3.11 | Fika, ModSync, headless — `MOD_FIELDS` |
| `is40` | 4.0 | Quartermaster, Fika Web App, `AUTO_UPDATE_*` — `V4_ONLY_FIELDS` |

**Those middle two answer different questions** — 3.11 has a mod ecosystem but not
the 4.0-only extras. Conflating them is the easy bug here, and the reason the old
`sptMajor !== "3"` idiom (which meant "is 4.0" back when there were two lines) is
gone: with three lines it silently means "4.0 or 4.1".

Adding a line, or unlocking mods for 4.1 when Fika ships it, should be an edit to
those predicates and the two field lists — not a hunt through conditionals.

## Develop

It's static — just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server -d configurator 8000   # → http://localhost:8000
node configurator/test_emit.cjs                # emitters + per-line gating
node configurator/test_zip.cjs                 # zip writer
```

> `test_emit.cjs`'s assertions live inside a **template literal**, so any regex in
> them needs its backslashes doubled (`[\\s\\S]`). It also drives `set()` rather
> than assigning `state.sptMajor` directly for the line-switching checks — the
> direct assignment bypasses the reset logic, which is exactly how a bug hid there.

## Deploy (behind the shared Caddy proxy)

```bash
cd configurator/deploy
docker compose up -d --build           # joins caddy-proxy-network, no published ports
```

Then add the block from `deploy/caddy-snippet.txt` to your Caddyfile and reload Caddy.

## Deliberately deferred (ponytail)

- ~~**Live version detection**~~ — built. SPT from the Forge API, Fika from GitHub
  releases; restricted to the living line (4.1), since asking for the latest 4.0.x
  would hand out a tag we publish no image for.
- **Syntax highlighting** — plain `<pre>` with line numbers; no highlighter dependency.
- **Presets** — the defaults already are the "common Fika server" preset.
- **`SPT_BACKEND_IP` field** — the 4.1 image already defaults it to `0.0.0.0` under
  `LISTEN_ALL_NETWORKS`, matching what 4.0 does in production. Add it if someone
  needs a specific advertised address.
