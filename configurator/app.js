// SPT-Fika configurator — form state → docker-compose.yml + .env + README bundle.
// No backend, no framework: the form mirrors docs/env-vars.md (the image contract),
// emits compose/.env client-side, and downloads a zip (see zip.js).

// ---- SPT lines ----------------------------------------------------------
// Three lines, each its own image. Only 4.1 is living; 4.0 and 3.11 are frozen at
// a pinned SPT and never rebuilt.
//
// These predicates exist because the old code said `sptMajor !== "3"` to mean
// "is 4.0". With a third line that idiom silently means "4.0 OR 4.1" and would
// switch Fika/ModSync/quma/webapp/headless on for 4.1, none of which support it
// yet. Ask the question you actually mean.
const is311 = (s) => s.sptMajor === "3";
const is40  = (s) => s.sptMajor === "4";
const is41  = (s) => s.sptMajor === "4.1";
// Frozen lines pin SPT: no Forge auto-fill, and the version field is read-only.
const isFrozen = (s) => is311(s) || is40(s);
// Two DIFFERENT questions, easy to conflate:
//
//   modsSupported — does this line have a mod ecosystem at all? True for 3.11 (Fika
//                   2.4.8 + Corter ModSync 0.11.1, both frozen) and 4.0. False for
//                   4.1, where nothing has shipped a build yet.
//   is40          — is this the line that gets the 4.0-only extras? Quartermaster,
//                   the Fika Web App and the AUTO_UPDATE_* knobs never worked on
//                   3.11 and do not exist for 4.1.
const modsSupported = (s) => !is41(s);
// Fields that need a mod ecosystem, and the narrower 4.0-only set. Listed once each
// so a 4.1 Fika release is one edit, not a hunt through gates.
const MOD_FIELDS = [
  "installFika", "fikaVersion",
  "useModsync", "modsyncVersion",
  "headlessEnabled", "headlessName", "headlessDir", "numHeadlessProfiles",
  "headlessProfileId", "headlessTag", "fikaHeadlessVersion",
];
const V4_ONLY_FIELDS = [
  "autoUpdateFika", "autoUpdateModsync",
  "webapp", "webappName", "webappApiKey", "webappPort",
  "quma", "qumaPort", "qumaAdminPassword", "qumaDiscordWebhook",
];

// ---- schema: the form surface. Defaults = the most common Fika server. ----
const TABS = [
  { id: "version", label: "VERSION", fields: [
    { key: "sptMajor", label: "SPT line", type: "select", def: "4.1",
      options: [["4.1", "4.1 (current)"], ["4", "4.0 (frozen)"], ["3", "3.11 (frozen)"]],
      help: (s) => is41(s)
        ? "SPT 4.1 — the living line. Bare server for now: Fika, ModSync and the headless client have no 4.1 build yet, so those options are off."
        : `SPT ${is311(s) ? "3.11" : "4.0"} is frozen — its image is built once and never chases a newer SPT. Fika and ModSync still work on it.` },
    { key: "sptVersion", label: "SPT version", type: "text", def: "4.1.0",
      help: (s) => isFrozen(s)
        ? `Locked to ${is311(s) ? "3.11.4" : "4.0.13"} — this line is frozen and no other tag is published.`
        : "Auto-filled to the latest stable 4.1.x from the Forge on load; edit to pin a version. (A tag published for the 4.1 image.)", req: true },
    { key: "installFika", label: "Install Fika", type: "toggle", def: true,
      help: (s) => modsSupported(s) ? "Install the Fika server mod on first boot." : "Fika has no build for this SPT line yet." },
    { key: "fikaVersion", label: "Fika version", type: "text", def: "2.3.2",
      help: (s) => `Auto-filled to the latest Fika server release on load; edit to pin a version. (Tag of project-fika/${is311(s) ? "Fika-Server" : "Fika-Server-CSharp"}.)`, req: true },
  ]},
  { id: "headless", label: "HEADLESS", arch: "x86_64", fields: [
    { key: "headlessEnabled", label: "Enable headless client", type: "toggle", def: false,
      help: "Adds a headless Fika client (zhliau image) that hosts raids unmanned. x86-only." },
    { key: "headlessName", label: "Headless name", type: "text", def: "spt-4.1.x-headless",
      help: "Container name + compose service id for the headless. Defaults to <base>-headless; clear to re-derive from the server name.", re: /^[a-zA-Z0-9_.-]+$/ },
    { key: "headlessDir", label: "Headless directory", type: "text", def: "../headless",
      help: "Host path bind-mounted to /opt/tarkov (the headless client's SPT + EFT files). Same convention as the data directory — ../headless is a sibling of the compose file's files/ folder." },
    { key: "numHeadlessProfiles", label: "Headless profiles", type: "number", def: "",
      help: "How many headless profiles the server creates on boot (sets headless.profiles.amount in fika.jsonc). Usually 1.", min: 0, max: 10 },
    { key: "headlessProfileId", label: "Headless profile ID", type: "text", def: "",
      help: "The server generates this on first boot — grab it from the logs, then set HEADLESS_PROFILE_ID in .env. Leave blank for now." },
    { key: "headlessTag", label: "Headless image tag", type: "text", def: "latest",
      help: "Tag of ghcr.io/zhliau/fika-headless-docker." },
    { key: "fikaHeadlessVersion", label: "Fika headless version", type: "text", def: "1.4.14",
      help: "Fika-Headless plugin release (project-fika/Fika-Headless). With ModSync on, the server stages Fika.Headless.dll so the headless syncs it. Own version scheme (1.4.x), separate from Fika." },
  ]},
  { id: "general", label: "GENERAL", fields: [
    { key: "serverName", label: "Server name", type: "text", def: "spt-4.1.x-server",
      help: "Container name + compose service id for the server. The part before -server is the stack base other services share (headless, webapp, quma, network). Defaults per SPT major.", re: /^[a-zA-Z0-9_.-]+$/ },
    { key: "dataDir", label: "Data directory", type: "text", def: "../server",
      help: "Host path bind-mounted to /opt/server (profiles, mods, configs persist here). Default assumes the compose file sits in a files/ subfolder (../server = sibling folder). For compose + data in one folder use ./server, or set an absolute path." },
    { key: "gamePort", label: "Game port", type: "number", def: 6969,
      help: "Host port mapped to the server's 6969. Clients connect here.", min: 1, max: 65535 },
    { key: "arch", label: "Host architecture", type: "radio", def: "x86_64",
      options: [["x86_64", "x86_64 (Intel/AMD)"], ["aarch64", "aarch64 (ARM)"]],
      help: "Headless is x86-only — selecting ARM disables the HEADLESS tab." },
    { key: "listenAll", label: "Listen on all networks", type: "toggle", def: true,
      help: "Bind 0.0.0.0 so LAN / remote Fika clients can reach the server. Usually on." },
  ]},
  { id: "ops", label: "OPS", fields: [
    { key: "restartPolicy", label: "Restart policy", type: "select", def: "unless-stopped",
      options: [["unless-stopped", "unless-stopped"], ["always", "always"],
                ["on-failure", "on-failure"], ["no", "no"]],
      help: "Docker restart policy for the service." },
    { key: "autoUpdateFika", label: "Auto-update Fika", type: "toggle", def: false,
      help: "Reinstall the pinned Fika version on boot if already installed (preserves fika.jsonc). Also re-stages the client + headless plugins when ModSync serves them." },
    { key: "autoUpdateModsync", label: "Auto-update ModSync", type: "toggle", def: false,
      help: "Reinstall the pinned ModSync version on boot if already installed (preserves config.jsonc)." },
    { key: "verboseLogs", label: "Verbose logs", type: "toggle", def: true,
      help: "Off filters high-frequency request spam (keepalive / ping / heartbeat)." },
    { key: "healthcheck", label: "Wait for a healthy server", type: "toggle", def: true,
      help: (s) => modsSupported(s)
        ? "The headless, web app and Quartermaster hold off until the server reports healthy, instead of starting the moment its container does — which matters because they read the server's files. Also makes `docker compose up -d --wait` return as soon as it's ready. Off = they start straight away. (The image health-checks itself either way; this just reacts faster.)"
        : "Makes `docker compose up -d --wait` return as soon as the server is ready rather than a few seconds later. Nothing else in this stack depends on the server, so it changes little here. (The image health-checks itself either way; this just reacts faster.)" },
  ]},
  { id: "adv", label: "ADV", fields: [
    { key: "puid", label: "PUID", type: "number", def: 1000, min: 0, max: 65535,
      help: "User id the server runs as / owns the mount." },
    { key: "pgid", label: "PGID", type: "number", def: 1000, min: 0, max: 65535,
      help: "Group id the server runs as." },
    { key: "userName", label: "User name", type: "text", def: "spt", re: /^[a-zA-Z0-9_-]+$/,
      help: "Name for a created user (ignored if PUID already exists on the host)." },
    { key: "groupName", label: "Group name", type: "text", def: "spt", re: /^[a-zA-Z0-9_-]+$/,
      help: "Name for a created group." },
  ]},
  { id: "mods", label: "QoL", fields: [
    { key: "useModsync", label: "Install ModSync", type: "toggle", def: false,
      help: "Adds the ModSync server mod so clients keep their mods in sync with the server. 4.0 uses the Dildz SPT4 fork; 3.11 uses Corter's original mod." },
    { key: "modsyncVersion", label: "ModSync version", type: "text", def: "0.12.5",
      help: "Release tag — Dildz/ModSync-for-SPT4.0 (4.0) or c-orter/ModSync (3.11)." },
    { key: "quma", label: "Install Quartermaster", type: "toggle", def: false,
      help: "Adds Quartermaster (quma) — an advanced server web UI for admins and players. Installs/updates/removes server mods from SPT Forge and talks to the Docker socket to restart the server. Reach it directly on the public IP or behind your reverse proxy. See the field guide for features. Available on SPT 4.0 only." },
    { key: "qumaPort", label: "Quartermaster port", type: "number", def: 9190, min: 1, max: 65535,
      help: "Host port for the quma dashboard over http. Put it behind your reverse proxy for HTTPS." },
    { key: "qumaAdminPassword", label: "Quartermaster admin password", type: "text", def: "",
      help: "Admin login for the quma dashboard (min 8 chars). Written to .env as QUMA_ADMIN_PASSWORD and applied on first boot." },
    { key: "qumaDiscordWebhook", label: "Quartermaster Discord webhook", type: "text", def: "",
      help: "Optional. Quartermaster checks Forge and GitHub for mod updates every 30 minutes and posts new ones to this Discord webhook. Leave blank to disable the check." },
    { key: "webapp", label: "Fika Web App", type: "toggle", def: false,
      help: "Adds the Fika Web App container (lacyway/fikawebapp) — a browser admin UI: accounts, item sending, profiles, headless control. Needs Fika." },
    { key: "webappName", label: "Web App name", type: "text", def: "spt-4.1.x-webapp",
      help: "Container name + compose service id for the web app. Defaults to <base>-webapp; clear to re-derive from the server name.", re: /^[a-zA-Z0-9_.-]+$/ },
    { key: "webappApiKey", label: "Web App API key", type: "text", def: "",
      help: "Generated by the Fika server (you'll have it after the first boot). Leave blank now and fill WEBAPP_API_KEY in .env later, or paste it here." },
    { key: "webappPort", label: "Web App port", type: "number", def: 8080, min: 1, max: 65535,
      help: "Host port for the web app UI over http. Put it behind your reverse proxy for HTTPS." },
  ]},
];

const FIELDS = {};
for (const t of TABS) for (const f of t.fields) FIELDS[f.key] = f;

// Versioned so a poisoned pre-fix state (browser autofill wrote 1000 into text
// fields) is abandoned once — bump on any change that must not inherit old state.
const STORE_KEY = "spt-fika-configurator-v1";
let state = loadState();
let activeTab = "version";
let previewMode = "compose"; // "compose" | "env" | "dockerfile"

// Preview tabs. dockerfile only exists on ARM + Fika Web App (see renderPreview).
const PREVIEWS = {
  compose:    { name: "docker-compose.yml", emit: emitCompose },
  env:        { name: ".env",               emit: emitEnv },
  dockerfile: { name: "webapp/Dockerfile",  emit: emitWebappDockerfile },
};

function loadState() {
  const s = {};
  for (const k in FIELDS) s[k] = FIELDS[k].def;
  try { Object.assign(s, JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); } catch {}
  // Never carry a stale selection into a line that cannot run it — a saved 4.0 state
  // loaded under 4.1 would otherwise emit services that have no 4.1 build.
  if (!modsSupported(s)) { s.installFika = false; s.useModsync = false; s.headlessEnabled = false; }
  if (!is40(s)) { s.quma = false; s.webapp = false; s.autoUpdateFika = false; s.autoUpdateModsync = false; }
  return s;
}
function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} }

// ---- validation: returns { key: message } for invalid fields ----
function validate() {
  const e = {};
  for (const k in FIELDS) {
    const f = FIELDS[k], v = state[k];
    if (f.type === "number" && v !== "") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < f.min || n > f.max) e[k] = `Must be ${f.min}–${f.max}.`;
    }
    if (f.req && String(v).trim() === "") e[k] = "Required.";
    if (f.re && String(v).trim() !== "" && !f.re.test(String(v))) e[k] = "Invalid characters.";
  }
  // quma admin password is required (min 8) only when Quartermaster is enabled.
  if (state.quma && String(state.qumaAdminPassword).trim().length < 8)
    e.qumaAdminPassword = "Min 8 characters.";
  return e;
}

// ---- emitters ----
// A headless client IS a Fika client — without Fika there is nothing for it to be.
// Gating it here means the headless service, QUMA_HEADLESS_CONTAINER and the headless
// plugin all switch off together when Fika is off.
function headlessOn() { return state.headlessEnabled && state.installFika && state.arch === "x86_64" && modsSupported(state); }
// Fika Web App is 4.0-only — gate the service, .env keys and ARM Dockerfile together.
function webappOn() { return state.webapp && is40(state); }
// Fika itself, and therefore everything downstream of it.
function fikaOn() { return state.installFika && modsSupported(state); }
function modsyncOn() { return state.useModsync && modsSupported(state); }

function emitCompose() {
  const s = state, svc = s.serverName || "spt-4.1.x-server";
  const base = svc.replace(/-server$/, "");          // shared stack base; other services suffix it
  const net = `${base}-net`;
  const hl = s.headlessName || `${base}-headless`;   // blank = derive from the base
  const wa = s.webappName || `${base}-webapp`;
  // Dedicated image per line, so a pull never crosses a major version. 4.0 keeps the
  // original published name (renaming a live public image to -4.0.x is a separate
  // coordinated republish, not a one-line change) and is frozen at 4.0.13.
  const image = is311(s) ? "ghcr.io/dildz/spt-fika-server-3.11.x"
              : is41(s)  ? "ghcr.io/dildz/spt-fika-server-4.1.x"
              :            "ghcr.io/dildz/spt-fika-server";
  const L = [
    "# SPT-FIKA Server — docker-compose.yml",
    "# Generated by the SPT-Fika configurator",
    "# https://github.com/Dildz/SPT-Fika-Docker-Guide",
    "",
    `name: ${base}`,
    "",
    "services:",
    `  ${svc}:`,
    `    image: ${image}:` + "${SPT_VERSION}",
    `    container_name: ${svc}`,
    `    restart: ${s.restartPolicy}`,
    "    ports:",
    `      - "${s.gamePort}:6969"`,
    "    env_file: .env",
    "    volumes:",
    `      - ${s.dataDir}:/opt/server`,
  ];
  // Every one of our images already declares a HEALTHCHECK (30s, same shape on all
  // three lines), so this block is an OVERRIDE, not an addition. Off simply emits
  // nothing and the image's own check applies — health checking never disappears,
  // which is why the toggle is about whether dependents WAIT for healthy, not about
  // whether a healthcheck exists.
  if (s.healthcheck) {
    // 4.1 ships an endpoint added specifically for container healthchecks. 4.0 + Fika
    // → the Fika presence endpoint, which proves Fika actually loaded rather than just
    // that SPT is up; otherwise (incl. all of 3.11, whose old Node Fika may not expose
    // it) the vanilla SPT /launcher/ping, always present.
    const ep = is41(s) ? "/health"
             : (is40(s) && s.installFika) ? "/fika/presence/get"
             : "/launcher/ping";
    L.push(
      "    # Tighter than the image's built-in check (30s), so dependent services and",
      "    # `docker compose up -d --wait` react as soon as the server is actually ready.",
      "    healthcheck:",
      `      test: ["CMD-SHELL", "curl -sfk https://localhost:6969${ep}"]`,
      "      interval: 10s",
      "      timeout: 5s",
      "      retries: 30",
      "      start_period: 30s",
    );
  }
  L.push("    networks:", `      - ${net}`);
  if (headlessOn()) {
    L.push(
      "",
      "  # Headless Fika client — hosts raids unmanned (interim zhliau image).",
      "  # PROFILE_ID is generated by the server on first boot; set HEADLESS_PROFILE_ID in .env then.",
      `  ${hl}:`,
      "    image: ghcr.io/zhliau/fika-headless-docker:${HEADLESS_TAG:-latest}",
      `    container_name: ${hl}`,
      `    restart: ${s.restartPolicy}`,
      "    depends_on:",
      `      ${svc}:`,
      `        condition: ${s.healthcheck ? "service_healthy" : "service_started"}`,
      "    ports:",
      '      - "25565:25565/udp"',
      "    environment:",
      `      SERVER_URL: ${svc}`,
      '      SERVER_PORT: "6969"',
      '      PROFILE_ID: "${HEADLESS_PROFILE_ID}"',
      `      UID: "${s.puid}"`,
      `      GID: "${s.pgid}"`,
      `      USE_MODSYNC: "${modsyncOn() ? "true" : "false"}"`,
      '      AUTO_RESTART_ON_RAID_END: "false"',
      '      SAVE_LOG_ON_EXIT: "true"',
      // ponytail: wine sync left at the image default — esync was an experimental flag; the target
      // is ntsync (as Outshynd's headless uses), to be settled when the native headless image lands.
      "    volumes:",
      "      # Put your SPT + EFT headless CLIENT files here — the headless runs a real game client.",
      `      - ${s.headlessDir}:/opt/tarkov`,
      "    networks:",
      `      - ${net}`,
    );
  }
  if (webappOn()) {
    // lacyway/fikawebapp is amd64-only. On ARM we don't re-host it — we rebuild it
    // locally from lacyway's OWN published image onto an arm64 .NET runtime (see
    // webapp/Dockerfile, shipped in the bundle). x86 pulls his image untouched.
    const webappImage = s.arch === "aarch64"
      ? ["    build: ./webapp", `    image: ${wa}:local`]
      : ["    image: lacyway/fikawebapp:latest"];
    L.push(
      "",
      "  # Fika Web App — basic server admin UI. Generate the API key on the server, then set WEBAPP_API_KEY in .env.",
      "  # Default login: admin / Admin123!  (change it immediately). Put it behind a reverse proxy for HTTPS.",
      `  ${wa}:`,
      ...webappImage,
      `    container_name: ${wa}`,
      `    restart: ${s.restartPolicy}`,
      "    depends_on:",
      `      ${svc}:`,
      `        condition: ${s.healthcheck ? "service_healthy" : "service_started"}`,
      "    environment:",
      '      PORT: "5000"',
      '      API_KEY: "${WEBAPP_API_KEY}"',
      `      BASE_URL: "https://${svc}:6969"`,
      "    ports:",
      `      - "${s.webappPort}:5000"`,
      "    command:",
      '      - "--quiet-logs"',
      "    volumes:",
      "      - webappdata:/app/data",   // named volume → no root-owned host folder to get stuck on
      "    networks:",
      `      - ${net}`,
    );
  }

  if (s.quma && is40(s)) {   // quma is 4.0-only
    // Quartermaster (quma) — mounts the data dir at /opt/server and the Docker socket.
    // It wraps the server by its known container name (QUMA_SERVER_CONTAINER), so the
    // data dir can be any path style (relative like ../server, or absolute). Starts as
    // root, joins the socket's group, then drops to PUID:PGID (no host-specific
    // group_add needed). Self-bootstraps on first boot from .env.
    L.push(
      "",
      "  # Quartermaster (quma) — advanced server web UI for admins and players. See the field guide for features.",
      "  # Reach it directly on the public IP or put it behind a reverse proxy. Admin password comes from .env (QUMA_ADMIN_PASSWORD).",
      `  ${base}-quma:`,
      "    image: ghcr.io/dildz/quma:latest",
      `    container_name: ${base}-quma`,
      `    restart: ${s.restartPolicy}`,
      "    depends_on:",
      `      ${svc}:`,
      `        condition: ${s.healthcheck ? "service_healthy" : "service_started"}`,   // quma reads the server's game files at first boot, so it must wait until SPT has populated them
      "    environment:",
      `      PUID: "${s.puid}"`,
      `      PGID: "${s.pgid}"`,
      "      QUMA_SPT_DIR: /opt/server",
      `      QUMA_SERVER_CONTAINER: ${svc}`,
      `      QUMA_SERVER_HOST: ${svc}`,
      '      QUMA_SERVER_PORT: "6969"',
      '      QUMA_AUTO_START_SERVER: "false"',
      '      QUMA_ADMIN_PASSWORD: "${QUMA_ADMIN_PASSWORD}"',
      // The headless is owned by this compose stack; quma only monitors it (status,
      // logs) and can start/stop/restart it. Without the name it cannot find it.
      ...(headlessOn() ? [`      QUMA_HEADLESS_CONTAINER: ${hl}`] : []),
      // Who owns the core mods. Auto-update on = this image reinstalls them every
      // boot, so quma must not touch them; off = the image installs once and quma
      // adopts them (update/remove from its web UI). No Fika = nothing to own.
      ...(fikaOn() ? [
        `      QUMA_MANAGE_FIKA: "${!s.autoUpdateFika}"`,
        `      FIKA_VERSION: "${s.fikaVersion}"`,
      ] : []),
      // Fika's headless plugin is a separate GitHub-only component on its own version
      // line — quma adopts it as its own mod, so it needs the version too. Only ever
      // installed when a headless is actually in play (headlessOn() implies Fika).
      ...(modsyncOn() && headlessOn() ? [`      FIKA_HEADLESS_VERSION: "${s.fikaHeadlessVersion}"`] : []),
      ...(modsyncOn() ? [
        `      QUMA_MANAGE_MODSYNC: "${!s.autoUpdateModsync}"`,
        `      MODSYNC_VERSION: "${s.modsyncVersion}"`,
      ] : []),
      ...(s.qumaDiscordWebhook ? ['      QUMA_DISCORD_WEBHOOK_URL: "${QUMA_DISCORD_WEBHOOK_URL}"'] : []),
      "    ports:",
      `      - "${s.qumaPort}:9190"`,
      "    volumes:",
      `      - ${s.dataDir}:/opt/server`,          // same tree the server mounts — quma manages its mods
      "      - /var/run/docker.sock:/var/run/docker.sock",
      "    networks:",
      `      - ${net}`,
    );
  }

  // One bridge network for the stack — services resolve each other by name on it.
  L.push("", "networks:", `  ${net}:`, `    name: ${net}`, "    driver: bridge");

  // Named volume for the web app data (avoids the bind-mount perms trap).
  if (webappOn()) L.push("", "volumes:", "  webappdata:");

  return L.join("\n") + "\n";
}

function emitEnv() {
  const s = state;
  const L = [
    "# SPT-FIKA Server — environment (.env)",
    "# Generated by the SPT-Fika configurator. See docs/env-vars.md.",
    "",
  ];
  // The 4.1 image has no SPT_MAJOR build/run branch — it is a single-line image, so
  // emitting one would be noise the entrypoint never reads.
  if (!is41(s)) L.push(`SPT_MAJOR=${s.sptMajor}`);
  L.push(
    `SPT_VERSION=${s.sptVersion}`,
  );
  // Fika has no 4.1 build yet — omit its keys entirely rather than emit INSTALL_FIKA=false.
  if (modsSupported(s)) L.push(
    `INSTALL_FIKA=${s.installFika}`,
    `FIKA_VERSION=${s.fikaVersion}`,
  );
  L.push(
    `LISTEN_ALL_NETWORKS=${s.listenAll}`,
    `VERBOSE_LOGS=${s.verboseLogs}`,
    `PUID=${s.puid}`,
    `PGID=${s.pgid}`,
    `USER_NAME=${s.userName}`,
    `GROUP_NAME=${s.groupName}`,
  );
  // Only 4.0 has both a living mod ecosystem and the auto-update machinery: 3.11's
  // installers are frozen install-once, and 4.1 has nothing to update yet.
  if (is40(s)) L.push(`AUTO_UPDATE_FIKA=${s.autoUpdateFika}`);
  if (headlessOn()) {
    L.push(`HEADLESS_TAG=${s.headlessTag}`);
    L.push(`HEADLESS_PROFILE_ID=${s.headlessProfileId}`);
    if (String(s.numHeadlessProfiles).trim() !== "") L.push(`NUM_HEADLESS_PROFILES=${s.numHeadlessProfiles}`);
  }
  if (modsyncOn()) {
    L.push("USE_MODSYNC=true");
    L.push(`MODSYNC_VERSION=${s.modsyncVersion}`);
    if (is40(s)) L.push(`AUTO_UPDATE_MODSYNC=${s.autoUpdateModsync}`);   // 3.11 is frozen — no auto-update
    // Headless plugin is staged into ModSync's folder only when a headless is also in
    // play; the client/headless staging is a 4.0 feature (3.11's installer is frozen).
    if (headlessOn() && is40(s)) L.push(`FIKA_HEADLESS_VERSION=${s.fikaHeadlessVersion}`);
  }
  if (webappOn()) L.push(`WEBAPP_API_KEY=${s.webappApiKey}`);
  if (s.quma && is40(s)) {   // quma is 4.0-only
    L.push(`QUMA_ADMIN_PASSWORD=${s.qumaAdminPassword}`);
    if (s.qumaDiscordWebhook) L.push(`QUMA_DISCORD_WEBHOOK_URL=${s.qumaDiscordWebhook}`);
  }
  return L.join("\n") + "\n";
}

// Step 2 of the README: where to unpack the bundle. The volume paths are relative
// to the compose file, so the folder layout is part of the contract — spell it out.
// Default (../server) = the "files/ subfolder" convention; ./ = flat; absolute = wherever.
function layoutSteps(s) {
  const arm = webappOn() && s.arch === "aarch64";
  const keep = arm ? " Keep the `webapp/` subfolder (it patches the ARM-only Fika Web App image at first build — nothing is downloaded from a third party)." : "";
  const rel = s.dataDir.startsWith("../");
  if (!rel) {
    return [`2. Put the bundle files in a folder together.${keep} Data persists in \`${s.dataDir}\` (relative to that folder).`];
  }
  // files/ convention — the mounts reach up one level into sibling folders.
  const tree = [
    "   ```",
    `   ${s.serverName.replace(/-server$/, "")}/`,
    "     files/        # docker-compose.yml + .env  (run compose from here)",
    `     ${s.dataDir.replace(/^\.\.\//, "")}/       # server data — profiles, mods, configs`,
    ...(headlessOn() ? [`     ${s.headlessDir.replace(/^\.\.\//, "")}/     # headless client SPT + EFT files`] : []),
    "   ```",
  ];
  return [
    `2. Put \`docker-compose.yml\` + \`.env\` in a \`files/\` subfolder — the volume paths point one level up (\`${s.dataDir}\`), so the data folders are siblings of \`files/\`:${keep}`,
    "",
    ...tree,
  ];
}

function emitReadme() {
  const s = state;
  return [
    "# SPT-FIKA Server — quick start",
    "",
    "Generated by the SPT-Fika configurator.",
    "",
    "1. Install Docker + Docker Compose.",
    ...layoutSteps(s),
    "3. Start it:",
    "",
    "   ```",
    "   docker compose up -d",
    "   ```",
    "",
    `4. Watch the first boot (Fika install + server start):`,
    "",
    "   ```",
    `   docker compose logs -f ${s.serverName}`,
    "   ```",
    "",
    `5. Connect the SPT launcher to \`https://<your-server-ip>:${s.gamePort}\`.`,
    "",
    `Server files persist in \`${s.dataDir}\`. To change settings, regenerate the bundle and \`docker compose up -d\` again.`,
    "",
  ].join("\n");
}

// ARM-only: patches lacyway's amd64-only image into a native arm64 one, built
// locally from his own published image. The app is framework-dependent .NET
// (Blazor) — its assemblies are architecture-neutral IL, so we lift /app onto
// the arm64 .NET runtime base. COPY only reads the amd64 layer (nothing runs) →
// no QEMU needed to build. Nothing is re-hosted.
function emitWebappDockerfile() {
  return [
    "# Auto-generated by the SPT-Fika configurator (ARM hosts only).",
    "# Rebuilds lacyway/fikawebapp for arm64 from its own published image on",
    "# first `docker compose up` — nothing is re-hosted, you build it locally.",
    "FROM --platform=linux/amd64 lacyway/fikawebapp:latest AS src",
    "FROM mcr.microsoft.com/dotnet/aspnet:10.0",
    "WORKDIR /app",
    "COPY --from=src /app /app",
    'ENTRYPOINT ["/app/entrypoint.sh"]',
    "",
  ].join("\n");
}

function bundleFiles() {
  const files = [
    { name: "docker-compose.yml", content: emitCompose() },
    { name: ".env", content: emitEnv() },
    { name: "README.md", content: emitReadme() },
  ];
  if (webappOn() && state.arch === "aarch64") {
    files.push({ name: "webapp/Dockerfile", content: emitWebappDockerfile() });
  }
  return files;
}

// ---- rendering ----
const $ = (id) => document.getElementById(id);

function renderTabs() {
  const bar = $("tabbar");
  bar.innerHTML = "";
  for (const t of TABS) {
    const b = document.createElement("button");
    b.className = "tab" + (t.id === activeTab ? " active" : "");
    b.textContent = t.label;
    const disabled = t.arch && t.arch !== state.arch;
    if (disabled) { b.classList.add("disabled"); b.title = "x86_64 only"; }
    b.onclick = () => { if (!disabled) { activeTab = t.id; render(); } };
    bar.appendChild(b);
  }
}

function renderFields() {
  const tab = TABS.find((t) => t.id === activeTab);
  const host = $("fields");
  host.innerHTML = "";
  const errs = validate();
  // Headless is x86-only AND Fika-only, so its whole tab greys out on ARM or on a
  // line with no Fika build.
  const tabDisabled = (tab.arch && tab.arch !== state.arch)
                   || (tab.id === "headless" && !modsSupported(state));

  for (const f of tab.fields) {
    const wrap = document.createElement("label");
    wrap.className = "field";

    const head = document.createElement("div");
    head.className = "field-label";
    head.textContent = f.label;
    wrap.appendChild(head);

    let input;
    const disabled = tabDisabled
      || (tab.id === "headless" && f.key !== "headlessEnabled" && !state.headlessEnabled)
      || (f.key === "modsyncVersion" && !state.useModsync)
      || (f.key === "fikaHeadlessVersion" && !state.useModsync)
      || (f.key === "autoUpdateModsync" && !state.useModsync)
      || ((f.key === "webappName" || f.key === "webappApiKey" || f.key === "webappPort") && !state.webapp)
      || ((f.key === "qumaAdminPassword" || f.key === "qumaPort" || f.key === "qumaDiscordWebhook") && !state.quma)
      // Frozen lines publish exactly one SPT tag, so the version is not a free field.
      || (f.key === "sptVersion" && isFrozen(state))
      // Everything mod-related is 4.0-only until Fika/ModSync/headless ship 4.1 builds.
      || (MOD_FIELDS.includes(f.key) && !modsSupported(state))
      || (V4_ONLY_FIELDS.includes(f.key) && !is40(state));

    if (f.type === "toggle") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!state[f.key];
      input.onchange = () => set(f.key, input.checked, true);
      wrap.classList.add("toggle");
    } else if (f.type === "select") {
      input = document.createElement("select");
      for (const [val, lbl] of f.options) {
        const o = document.createElement("option");
        o.value = val; o.textContent = lbl; o.selected = state[f.key] === val;
        input.appendChild(o);
      }
      input.onchange = () => set(f.key, input.value, true);
    } else if (f.type === "radio") {
      input = document.createElement("div");
      input.className = "radio-row";
      for (const [val, lbl] of f.options) {
        const r = document.createElement("button");
        r.type = "button";
        r.className = "radio" + (state[f.key] === val ? " active" : "");
        r.textContent = lbl;
        r.onclick = () => set(f.key, val, true);
        input.appendChild(r);
      }
    } else if (f.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 5;
      input.value = state[f.key];
      input.oninput = () => set(f.key, input.value, false);
    } else {
      input = document.createElement("input");
      input.type = f.type === "number" ? "number" : "text";
      input.value = state[f.key];
      input.oninput = () => set(f.key, input.value, false);
    }
    // State lives in localStorage, not the DOM. Give each control a stable name and
    // turn autofill off — otherwise the browser restores form values by control
    // *index* on reload and bleeds one field into another (e.g. PUID's 1000 lands in
    // Server name / Data directory), overwriting our defaults after render.
    if (["INPUT", "SELECT", "TEXTAREA"].includes(input.tagName)) {
      input.name = f.key;
      input.autocomplete = "off";
    }
    if (disabled && input.tagName) input.disabled = true;
    wrap.appendChild(input);

    const help = document.createElement("div");
    help.className = "help";
    help.textContent = typeof f.help === "function" ? f.help(state) : f.help;
    wrap.appendChild(help);

    if (errs[f.key]) {
      const err = document.createElement("div");
      err.className = "error";
      err.textContent = errs[f.key];
      wrap.appendChild(err);
    }
    host.appendChild(wrap);
  }
}

function renderPreview() {
  const armWebapp = webappOn() && state.arch === "aarch64";
  // The Dockerfile tab only ships on ARM + webapp — if that combo just went away
  // while it was selected, fall back to compose so we don't render a stale file.
  if (previewMode === "dockerfile" && !armWebapp) previewMode = "compose";
  $("btn-webapp").hidden = !armWebapp;

  const view = PREVIEWS[previewMode];
  $("preview-name").textContent = view.name;
  $("btn-yaml").classList.toggle("active", previewMode === "compose");
  $("btn-env").classList.toggle("active", previewMode === "env");
  $("btn-webapp").classList.toggle("active", previewMode === "dockerfile");
  const text = view.emit();
  const code = $("code");
  code.innerHTML = "";
  text.replace(/\n$/, "").split("\n").forEach((line, i) => {
    const ln = document.createElement("span");
    ln.className = "ln";
    ln.textContent = String(i + 1).padStart(3, " ");
    const tx = document.createElement("span");
    tx.textContent = " " + line;
    const row = document.createElement("div");
    row.append(ln, tx);
    code.appendChild(row);
  });

  const errs = validate();
  $("download").disabled = Object.keys(errs).length > 0;
}

function render() { renderTabs(); renderFields(); renderPreview(); }

// rerenderTab=true when a change can flip disabled/active states (toggle/select/radio);
// for free-typing we only refresh the preview so the input keeps focus.
function set(key, val, rerenderTab) {
  const f = FIELDS[key];
  state[key] = f && f.type === "number" && val !== "" ? Number(val) : val;
  if (key === "sptVersion") state.__pinnedSpt = true;   // user edited → stop auto-filling
  if (key === "fikaVersion") state.__pinnedFika = true;
  if (key === "sptMajor") {
    // SPT/Fika versions differ per major — drop the pins, set sane defaults now so
    // the fields are never stale-for-the-wrong-major, then refetch latest below.
    delete state.__pinnedSpt; delete state.__pinnedFika;
    const next = { sptMajor: val };
    // Frozen lines pin to their one published tag; 4.1 gets a default the Forge then
    // refreshes below.
    state.sptVersion     = val === "3" ? "3.11.4" : val === "4" ? "4.0.13" : "4.1.0";
    state.fikaVersion    = val === "3" ? "2.4.8"  : "2.3.2";
    state.modsyncVersion = val === "3" ? "0.11.1" : "0.12.5";
    // Retitle only the stack names still at some line's default (untouched); a name
    // the user has customised is left alone — no per-field pin needed.
    const BASES = { "3": "spt-3.11.4", "4": "spt-4.0.13", "4.1": "spt-4.1.x" };
    const newBase = BASES[val];
    for (const [k, suffix] of [["serverName", "-server"], ["headlessName", "-headless"], ["webappName", "-webapp"]])
      if (Object.values(BASES).some((b) => state[k] === `${b}${suffix}`)) state[k] = `${newBase}${suffix}`;
    // 3.11: frozen, no auto-update; quma + Fika Web App are 4.0-only.
    if (val === "3") { state.autoUpdateFika = false; state.quma = false; state.webapp = false; }
    // Mod toggles follow the line, the same way the version fields do: forced off where
    // the line has no build (4.1), and back to their normal defaults where it does —
    // otherwise switching 4.1 -> 4.0 would silently leave Fika off, which is the one
    // thing nobody picks 4.0 for.
    for (const k of MOD_FIELDS.concat(V4_ONLY_FIELDS)) {
      if (FIELDS[k] && typeof FIELDS[k].def === "boolean")
        state[k] = modsSupported(next) ? FIELDS[k].def : false;
    }
    if (!is40(next)) { state.quma = false; state.webapp = false; state.autoUpdateFika = false; state.autoUpdateModsync = false; }
  }
  saveState();
  if (rerenderTab) render();
  else { renderFields(); renderPreview(); }
  if (key === "sptMajor") detectVersions();   // refetch the latest for the newly-selected major
}

// ---- actions ----
function init() {
  render();
  // Clamp the preview box to the form box height — scroll the YAML inside, so the
  // two columns always line up regardless of which tab (and how many fields) is shown.
  const formPanel = document.querySelector(".form-panel");
  const previewPanel = document.querySelector(".preview-panel");
  if (formPanel && previewPanel && "ResizeObserver" in window) {
    const syncPreviewHeight = () => { previewPanel.style.height = formPanel.offsetHeight + "px"; };
    new ResizeObserver(syncPreviewHeight).observe(formPanel);
    syncPreviewHeight();
  }
  $("btn-yaml").onclick = () => { previewMode = "compose"; renderPreview(); };
  $("btn-env").onclick = () => { previewMode = "env"; renderPreview(); };
  $("btn-webapp").onclick = () => { previewMode = "dockerfile"; renderPreview(); };
  $("copy").onclick = async () => {
    const text = PREVIEWS[previewMode].emit();
    try { await navigator.clipboard.writeText(text); flash($("copy"), "Copied"); } catch {}
  };
  $("download").onclick = () => {
    const bytes = makeZip(bundleFiles());
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${state.serverName}-bundle.zip`; a.click();
    URL.revokeObjectURL(url);
  };
  $("reset").onclick = () => {
    for (const k in FIELDS) state[k] = FIELDS[k].def;
    delete state.__pinnedSpt; delete state.__pinnedFika;
    saveState(); render(); detectVersions();
  };
  bootReadout();
  initNav();
  detectVersions();
}

// Live version defaults — fetch the latest on load, fall back to the static field
// defaults if a source is unreachable/rate-limited. SPT from the Forge (clean 4.0.x,
// no beta tags); the Fika *server* version from its GitHub releases — what
// install_fika.sh actually downloads. (The Forge "Project Fika" entry tracks the
// client plugin, which can run ahead of the server.) A field the user has edited
// is pinned and never overwritten.
function detectVersions() {
  if (typeof fetch !== "function") return;
  const getJson = (url) =>
    fetch(url, { headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));

  // Only 4.1 is living, so it is the only line worth asking the Forge about. Querying
  // for a frozen line would hand back a tag we publish no image for the moment SPT
  // ships another 4.0.x or 3.11.x.
  if (!isFrozen(state)) {
    getJson("https://forge.sp-tarkov.com/api/v0/spt/versions?filter%5Bspt_version%5D=%5E4.1.0&sort=-version&per_page=1&fields=version")
      .then((j) => { const v = j && j.data && j.data[0] && j.data[0].version; if (v && !state.__pinnedSpt) applyVersion("sptVersion", v); })
      .catch(() => {});
  }

  // Fika only ships for the mod-capable lines. 4.0 = C# server (Fika-Server-CSharp);
  // 3.11 = the pre-C# Node server (the old Fika-Server repo).
  if (modsSupported(state)) {
    const fikaRepo = is311(state) ? "Fika-Server" : "Fika-Server-CSharp";
    getJson(`https://api.github.com/repos/project-fika/${fikaRepo}/releases/latest`)
      .then((j) => { const v = j && j.tag_name && j.tag_name.replace(/^v/, ""); if (v && !state.__pinnedFika) applyVersion("fikaVersion", v); })
      .catch(() => {});
  }
}
function applyVersion(key, v) {
  if (state[key] === v) return;
  state[key] = v; saveState(); renderFields(); renderPreview();
}

// Scroll-spy: highlight the top-bar link for whichever section is in view.
function initNav() {
  const links = [...document.querySelectorAll(".nav a[data-nav]")];
  if (!links.length || !("IntersectionObserver" in window)) return;
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((l) => l.classList.remove("active"));
      const a = byId.get(e.target.id);
      if (a) a.classList.add("active");
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  byId.forEach((_, id) => { const el = $(id); if (el) io.observe(el); });
}

// Signature hero animation: reveal a faux assemble manifest line by line.
function bootReadout() {
  const el = $("boot");
  if (!el) return;
  const lines = [
    '<span class="cmd">spt-fika@deploy:~$</span> ./assemble.sh --fika',
    '<span class="ok">✓</span> image    <span class="key">ghcr.io/dildz/spt-fika-server-4.1.x:4.1.0</span>',
    '<span class="ok">✓</span> fika mod <span class="key">2.3.2 (4.0)</span>',
    '<span class="ok">✓</span> listen   <span class="key">0.0.0.0:6969</span>',
    '<span class="ok">✓</span> quma     <span class="key">mod manager</span>',
    '<span class="ok">✓</span> bundle   compose · .env · readme',
    '<span class="ready">● READY</span> — extract &amp; docker compose up -d',
  ];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.innerHTML = lines.join("\n"); return;
  }
  let i = 0;
  (function next() {
    if (i >= lines.length) return;
    el.innerHTML += (i ? "\n" : "") + lines[i++];
    setTimeout(next, 360);
  })();
}

function flash(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 1200);
}

document.addEventListener("DOMContentLoaded", init);
