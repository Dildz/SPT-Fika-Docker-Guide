// Offline check for the emitters: loads app.js in a tiny DOM shim and asserts
// the non-obvious logic (arch-gated headless, required keys, quma/modsync emit).
// Run: node test_emit.cjs   (no docker, no browser needed)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const noop = () => {};
const elStub = () => new Proxy(() => {}, { get: () => elStub(), set: () => true, apply: () => elStub() });
const ctx = {
  TextEncoder, console,
  localStorage: { getItem: () => null, setItem: noop },
  navigator: { clipboard: { writeText: async () => {} } },
  setTimeout: noop, URL: { createObjectURL: () => "", revokeObjectURL: noop }, Blob: function () {},
  document: { getElementById: () => elStub(), createElement: () => elStub(), addEventListener: noop },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "zip.js"), "utf8"), ctx);

const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exit(1); } };

const epilogue = `
// ---- defaults = SPT 4.1, the living line: a BARE server ----
// 4.1 has no Fika, ModSync, headless, Quartermaster or Web App build yet, so the
// default bundle must contain none of them. These negative assertions are the point:
// the old code said "not 3.11" to mean "4.0", which would have switched the whole
// mod ecosystem on for 4.1.
const dEnv = emitEnv(), dCompose = emitCompose();
checks([
  [dEnv.includes("SPT_VERSION=4.1.1"), "default SPT_VERSION = 4.1.1"],
  [dCompose.includes("ghcr.io/dildz/spt-fika-server-4.1.x:"), "4.1 pulls the dedicated -4.1.x image"],
  [dCompose.includes('"6969:6969"'), "default port mapping"],
  [dCompose.includes("- ../server:/opt/server"), "default data dir mount"],
  [dCompose.includes("name: spt-4.1.x"), "project name = stack base (4.1.x)"],
  [dCompose.includes("container_name: spt-4.1.x-server"), "default server name = base-server"],
  [dCompose.includes("- spt-4.1.x-net"), "server joins the network"],
  // the bare-server guarantees
  [!dEnv.includes("INSTALL_FIKA"), "no INSTALL_FIKA on 4.1"],
  [!dEnv.includes("FIKA_VERSION"), "no FIKA_VERSION on 4.1"],
  [!dEnv.includes("AUTO_UPDATE"), "no AUTO_UPDATE_* on 4.1"],
  [!dEnv.includes("USE_MODSYNC"), "no ModSync vars on 4.1"],
  [!dEnv.includes("SPT_MAJOR"), "no SPT_MAJOR on 4.1 (single-line image)"],
  [!dCompose.includes("headless"), "no headless on 4.1"],
  [!dCompose.includes("quma"), "no Quartermaster on 4.1"],
  [!dCompose.includes("fikawebapp"), "no Fika Web App on 4.1"],
  [dCompose.includes("/health"), "4.1 uses the container health endpoint"],
  [!dCompose.includes("/fika/presence/get"), "4.1 does not use the Fika healthcheck"],
]);

// A stale 4.0 selection must not leak services into a 4.1 bundle.
state.installFika = true; state.useModsync = true; state.headlessEnabled = true;
state.quma = true; state.webapp = true; state.qumaAdminPassword = "supersecret";
checks([
  [!emitCompose().includes("headless"), "4.1 suppresses a carried-over headless"],
  [!emitCompose().includes("quma"), "4.1 suppresses a carried-over quma"],
  [!emitCompose().includes("fikawebapp"), "4.1 suppresses a carried-over web app"],
  [!emitEnv().includes("USE_MODSYNC"), "4.1 suppresses carried-over ModSync vars"],
  [!emitEnv().includes("INSTALL_FIKA"), "4.1 suppresses carried-over Fika vars"],
]);
state.useModsync = false; state.headlessEnabled = false; state.quma = false; state.webapp = false;
state.installFika = false;

// ---- game port ----
// A non-default port is how a second stack runs alongside an existing one, and it must
// reach the SERVER, not just the host side of the mapping: SPT builds every URL it
// hands a client — the websocket one included — as "<host>:<backendPort>" read from
// http.json (HttpServerHelper.buildUrl, same on all three lines). A host-side-only
// remap therefore advertises a port nothing listens on. So: SPT_PORT emitted on every
// line, mapping always 1:1, healthcheck follows.
state.gamePort = 6979;
// NOTE: this whole file body is injected as a template literal, so no backticks and
// no \${} in here — plain concatenation only.
const portChecks = (line, ep) => checks([
  [emitCompose().includes('- "6979:6979"'), line + " maps the game port 1:1"],
  [emitEnv().includes("SPT_PORT=6979"), line + " emits SPT_PORT so the server binds and advertises it"],
  [emitCompose().includes("https://localhost:6979" + ep), line + " healthcheck follows the game port"],
  [!emitCompose().includes(":6969"), line + " leaves no 6969 behind"],
]);
portChecks("4.1", "/health");
state.sptMajor = "4"; state.sptVersion = "4.0.13"; portChecks("4.0", "/launcher/ping");
state.sptMajor = "3"; state.sptVersion = "3.11.4"; portChecks("3.11", "/launcher/ping");
state.sptMajor = "4"; state.sptVersion = "4.0.13"; state.gamePort = 6969;

// ---- everything below exercises the mod ecosystem, which lives on 4.0 ----
state.sptMajor = "4"; state.sptVersion = "4.0.13"; state.installFika = true;
state.serverName = "spt-4.0.13-server"; state.headlessName = ""; state.webappName = "";
checks([
  [emitEnv().includes("SPT_MAJOR=4"), "4.0 emits SPT_MAJOR"],
  [emitEnv().includes("INSTALL_FIKA=true"), "default INSTALL_FIKA on 4.0"],
  [emitEnv().includes("FIKA_VERSION=2.3.2"), "default FIKA_VERSION on 4.0"],
  [emitCompose().includes("/fika/presence/get"), "fika healthcheck emitted on 4.0"],
  [emitCompose().includes("ghcr.io/dildz/spt-fika-server:"), "4.0 pulls the base image"],
]);

// Default stack names: shared base spt-4.0.13 with per-service suffixes.
state.arch = "x86_64"; state.headlessEnabled = true; state.webapp = true;
checks([
  [emitCompose().includes("  spt-4.0.13-headless:"), "default headless name = base-headless"],
  [emitCompose().includes("  spt-4.0.13-webapp:"), "default webapp name = base-webapp"],
]);
state.headlessEnabled = false; state.webapp = false;

// Pin the base for the remaining service-naming assertions (independent of the per-major default).
// Blank the derived names so they re-derive from the pinned base.
state.serverName = "spt-fika"; state.headlessName = ""; state.webappName = "";

state.arch = "x86_64"; state.headlessEnabled = true; state.headlessTag = "latest";
checks([
  [emitCompose().includes("spt-fika-headless"), "headless service on x86"],
  [emitCompose().includes("- ../headless:/opt/tarkov"), "headless dir mount default"],
  [emitCompose().includes("25565:25565/udp"), "headless P2P udp port"],
  [emitCompose().includes("SERVER_URL: spt-fika"), "headless SERVER_URL = server service"],
  [emitCompose().includes('condition: service_healthy'), "headless waits for healthy server"],
  [emitEnv().includes("HEADLESS_TAG=latest"), "HEADLESS_TAG emitted"],
  [emitEnv().includes("HEADLESS_PROFILE_ID="), "HEADLESS_PROFILE_ID emitted"],
]);

// Headless name: blank derives <server>-headless (above); a value overrides it.
state.headlessName = "my-headless";
checks([
  [emitCompose().includes("  my-headless:"), "custom headless name is the service id"],
  [emitCompose().includes("container_name: my-headless"), "custom headless container_name"],
  [!emitCompose().includes("spt-fika-headless"), "server-derived headless name replaced"],
]);
state.headlessName = "";

checks([[!emitEnv().includes("USE_MODSYNC"), "no ModSync vars when off"]]);
state.useModsync = true; state.modsyncVersion = "0.12.5";
checks([
  [emitEnv().includes("USE_MODSYNC=true"), "USE_MODSYNC emitted"],
  [emitEnv().includes("MODSYNC_VERSION=0.12.5"), "MODSYNC_VERSION emitted"],
  [emitEnv().includes("AUTO_UPDATE_MODSYNC="), "AUTO_UPDATE_MODSYNC emitted on 4.0 ModSync"],
  [emitEnv().includes("FIKA_HEADLESS_VERSION=1.4.15"), "FIKA_HEADLESS_VERSION emitted when headless + ModSync"],
]);

state.sptMajor = "3";
state.webapp = true;   // Fika Web App is 4.0-only — must be suppressed on 3.11 regardless of the toggle
checks([
  [!emitCompose().includes("fikawebapp"), "Fika Web App gated off on SPT 3.11"],
  [!emitEnv().includes("WEBAPP_API_KEY"), "no WEBAPP_API_KEY in .env on 3.11"],
]);
state.webapp = false;
checks([
  [emitEnv().includes("USE_MODSYNC=true"), "ModSync now works on SPT 3.11 (Corter original)"],
  [emitCompose().includes("ghcr.io/dildz/spt-fika-server-3.11.x:"), "3.11 pulls the dedicated -3.11.x image"],
  [!emitEnv().includes("AUTO_UPDATE_MODSYNC"), "no AUTO_UPDATE_MODSYNC on frozen 3.11"],
  [!emitEnv().includes("FIKA_HEADLESS_VERSION"), "no FIKA_HEADLESS_VERSION on frozen 3.11"],
]);
state.quma = true; state.qumaAdminPassword = "supersecret";
checks([
  [!emitCompose().includes("ghcr.io/dildz/quma"), "quma is 4.0-only — gated off on SPT 3.11"],
  [!emitEnv().includes("QUMA_ADMIN_PASSWORD"), "no quma password in .env on 3.11"],
]);
state.quma = false;
state.sptMajor = "4";
checks([
  [emitCompose().includes("ghcr.io/dildz/spt-fika-server:") && !emitCompose().includes("spt-fika-server-3.11.x"), "4.0 pulls the base image"],
]);

state.quma = true;
checks([
  [/spt-fika-quma:[\\s\\S]*?condition: service_healthy/.test(emitCompose()), "quma waits for a healthy server before first-boot setup"],
]);

// Core-mod ownership: auto-update ON = the image reinstalls every boot (quma must not
// touch them); OFF = quma adopts them and can update/remove from its web UI.
state.autoUpdateFika = true; state.autoUpdateModsync = true;
checks([
  [emitCompose().includes('QUMA_MANAGE_FIKA: "false"'), "auto-update Fika on = compose owns Fika"],
  [emitCompose().includes('QUMA_MANAGE_MODSYNC: "false"'), "auto-update ModSync on = compose owns ModSync"],
]);
state.autoUpdateFika = false; state.autoUpdateModsync = false;
checks([
  [emitCompose().includes('QUMA_MANAGE_FIKA: "true"'), "auto-update Fika off = quma owns Fika"],
  [emitCompose().includes('QUMA_MANAGE_MODSYNC: "true"'), "auto-update ModSync off = quma owns ModSync"],
  [emitCompose().includes("FIKA_VERSION:"), "quma gets FIKA_VERSION to adopt against"],
  [emitCompose().includes("MODSYNC_VERSION:"), "quma gets MODSYNC_VERSION to adopt against"],
]);

// Discord webhook is optional: no field, no env, no compose var.
checks([
  [!emitCompose().includes("QUMA_DISCORD_WEBHOOK_URL"), "no webhook var when the field is blank"],
  [!emitEnv().includes("QUMA_DISCORD_WEBHOOK_URL"), "no webhook in .env when the field is blank"],
]);
state.qumaDiscordWebhook = "https://discord.com/api/webhooks/1/abc";
checks([
  [emitCompose().includes('QUMA_DISCORD_WEBHOOK_URL: "\${QUMA_DISCORD_WEBHOOK_URL}"'), "webhook wired from .env when set"],
  [emitEnv().includes("QUMA_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1/abc"), "webhook value lands in .env"],
]);
state.qumaDiscordWebhook = "";
state.quma = false;

// Every image declares its own 30s HEALTHCHECK, so "off" emits nothing and the image's
// check applies — the toggle governs whether dependents WAIT for healthy, not whether
// health checking exists. It must never emit \`disable: true\`.
state.healthcheck = false;
checks([
  [!emitCompose().includes("healthcheck:"), "no compose healthcheck block when toggled off"],
  [!emitCompose().includes("disable: true"), "off falls back to the image's check, never disables it"],
  [emitCompose().includes("condition: service_started"), "deps gate on service_started when off"],
  [!emitCompose().includes("service_healthy"), "no service_healthy when off"],
]);
state.healthcheck = true;
checks([
  [emitCompose().includes("CMD-SHELL"), "on emits an override test command"],
  [emitCompose().includes("interval: 10s"), "on overrides with a tighter interval than the image's 30s"],
  [!emitCompose().includes("disable: true"), "on never disables"],
]);
state.healthcheck = true;

checks([[!emitCompose().includes("fikawebapp"), "no web app by default"]]);
state.webapp = true; state.webappApiKey = "abc123"; state.webappPort = 8080;
checks([
  [emitCompose().includes("lacyway/fikawebapp:latest"), "web app service emitted"],
  [emitCompose().includes('"8080:5000"'), "web app port mapped"],
  [emitCompose().includes("webappdata:/app/data"), "web app uses named volume"],
  [/\\nvolumes:\\n  webappdata:/.test(emitCompose()), "named volume declared"],
  [emitEnv().includes("WEBAPP_API_KEY=abc123"), "WEBAPP_API_KEY emitted"],
]);
state.webapp = false;

state.arch = "aarch64";
checks([[!emitCompose().includes("headless"), "headless suppressed on ARM"]]);

// ARM: webapp is patched locally from lacyway's image, not pulled (amd64-only).
state.webapp = true;
const armWebapp = bundleFiles().find((f) => f.name === "webapp/Dockerfile");
checks([
  [emitCompose().includes("build: ./webapp"), "ARM webapp builds locally"],
  [emitCompose().includes("image: spt-fika-webapp:local"), "ARM webapp tags the local build"],
  [!emitCompose().includes("lacyway/fikawebapp:latest"), "ARM does not pull the amd64 image"],
  [!!armWebapp, "webapp/Dockerfile shipped in the bundle on ARM"],
  [armWebapp && armWebapp.content.includes("mcr.microsoft.com/dotnet/aspnet:10.0"), "webapp Dockerfile targets the arm64 .NET runtime base"],
  [armWebapp && armWebapp.content.includes("FROM --platform=linux/amd64 lacyway/fikawebapp:latest"), "webapp Dockerfile sources lacyway's own image"],
]);
state.webapp = false;

// Quartermaster (quma) optional service.
state.arch = "x86_64";
checks([[!emitCompose().includes("-quma:"), "no quma service by default"]]);
state.quma = true; state.qumaAdminPassword = "supersecret"; state.qumaPort = 9190;
checks([
  [emitCompose().includes("ghcr.io/dildz/quma:latest"), "quma image emitted"],
  [emitCompose().includes("spt-fika-quma:"), "quma service named off the server name"],
  [emitCompose().includes('"9190:9190"'), "quma port mapped"],
  [emitCompose().includes("/var/run/docker.sock:/var/run/docker.sock"), "quma mounts the docker socket"],
  [emitCompose().includes("QUMA_SERVER_CONTAINER: spt-fika"), "quma points at the server container"],
  [emitEnv().includes("QUMA_ADMIN_PASSWORD=supersecret"), "QUMA_ADMIN_PASSWORD emitted to .env"],
  [emitCompose().includes("QUMA_SPT_DIR: /opt/server"), "quma reads the data dir at /opt/server"],
  [emitCompose().includes("- ../server:/opt/server"), "quma mounts the data dir (any path style) at /opt/server"],
  [!validate().qumaAdminPassword, "quma password valid at 8+ chars"],
]);
state.qumaAdminPassword = "short";
checks([[!!validate().qumaAdminPassword, "quma rejects a <8 char password"]]);
state.quma = false;

// Fika off: healthcheck falls back to /launcher/ping and INSTALL_FIKA=false.
state.sptMajor = "4"; state.healthcheck = true; state.installFika = false;
checks([
  [emitEnv().includes("INSTALL_FIKA=false"), "INSTALL_FIKA=false emitted"],
  [emitCompose().includes("/launcher/ping"), "healthcheck falls back to /launcher/ping without Fika"],
  [!emitCompose().includes("/fika/presence/get"), "no Fika presence check without Fika"],
]);
state.installFika = true;
checks([[emitCompose().includes("/fika/presence/get"), "Fika presence check restored with Fika on 4.0"]]);

// autoUpdateFika: emitted on 4.0 (living), omitted on frozen 3.11.
state.sptMajor = "4"; state.autoUpdateFika = true;
checks([[emitEnv().includes("AUTO_UPDATE_FIKA=true"), "AUTO_UPDATE_FIKA emitted on 4.0"]]);
state.sptMajor = "3";
checks([[!emitEnv().includes("AUTO_UPDATE_FIKA"), "AUTO_UPDATE_FIKA omitted on frozen 3.11"]]);
state.sptMajor = "4"; state.autoUpdateFika = false;

// listenAll -> LISTEN_ALL_NETWORKS passthrough (both states).
state.listenAll = true;
checks([[emitEnv().includes("LISTEN_ALL_NETWORKS=true"), "LISTEN_ALL_NETWORKS=true emitted"]]);
state.listenAll = false;
checks([[emitEnv().includes("LISTEN_ALL_NETWORKS=false"), "LISTEN_ALL_NETWORKS=false emitted"]]);

// Validation surface: name regex + number range.
state.userName = "bad name!";
checks([[!!validate().userName, "invalid userName rejected by regex"]]);
state.userName = "spt";
state.puid = 99999999;
checks([[!!validate().puid, "out-of-range PUID rejected"]]);
state.puid = 1000;
checks([[Object.keys(validate()).length === 0, "clean state has no validation errors"]]);

// ---- switching SPT lines goes through set(), not a raw assignment ----
// This is the path the UI actually takes, and the one that regressed: 4.1 forces the
// mod toggles off, so coming back to a mod-capable line has to turn Fika on again or
// the user silently gets a co-op-less 4.0 server.
const line = (v) => { set("sptMajor", v); return { name: state.serverName, ver: state.sptVersion,
  fika: state.installFika, quma: state.quma, img: emitCompose().split("image: ")[1].split(":")[0] }; };

// Earlier tests pinned a custom server name, which a line switch deliberately leaves
// alone. Restore a known per-line default first so the rename is observable.
state.sptMajor = "4.1"; state.serverName = "spt-4.1.x-server";
state.headlessName = ""; state.webappName = "";
checks([[state.serverName === "spt-4.1.x-server", "test setup: name back on a known base"]]);

let L = line("4");
checks([
  [L.name === "spt-4.0.13-server", "4.0 renames the stack base"],
  [L.ver === "4.0.13", "4.0 pins the frozen version"],
  [L.fika === true, "switching to 4.0 turns Fika back on"],
  [L.img === "ghcr.io/dildz/spt-fika-server", "4.0 image"],
]);

state.useModsync = true; state.quma = true; state.qumaAdminPassword = "supersecret";
L = line("4.1");
checks([
  [L.name === "spt-4.1.x-server", "4.1 renames the stack base"],
  [L.ver === "4.1.1", "4.1 resets the version"],
  [L.fika === false, "4.1 forces Fika off"],
  [L.quma === false, "4.1 forces quma off"],
  [state.useModsync === false, "4.1 forces ModSync off"],
  [L.img === "ghcr.io/dildz/spt-fika-server-4.1.x", "4.1 image"],
  [!emitCompose().includes("quma"), "no quma service survives the switch to 4.1"],
]);

L = line("3");
checks([
  [L.name === "spt-3.11.4-server", "3.11 renames the stack base"],
  [L.ver === "3.11.4", "3.11 pins the frozen version"],
  [L.fika === true, "3.11 supports Fika"],
  [L.quma === false, "quma stays off on 3.11 (4.0-only)"],
  [L.img === "ghcr.io/dildz/spt-fika-server-3.11.x", "3.11 image"],
]);

// ---- SPT version auto-fill picks the newest 4.1.x, not the newest release ----
// The Forge is gone (shut down with the project on 2026-08-12), so this reads GitHub
// releases. GitHub's /releases/latest is by publish date across ALL lines, which is why
// the code lists releases and filters: a 4.0.x hotfix shipped after 4.1.1 must not land
// in the 4.1 form, and beta tags must not either.
fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([
  { tag_name: "4.1.2-BE-1", prerelease: true,  draft: false },   // beta — skip
  { tag_name: "4.0.14",     prerelease: false, draft: false },   // newest overall — wrong line
  { tag_name: "4.1.1",      prerelease: false, draft: false },   // the answer
  { tag_name: "4.1.0",      prerelease: false, draft: false },
]) });
line("4.1");
state.sptVersion = "0.0.0";
detectVersions();
// detectVersions resolves through a couple of microtask hops (fetch -> json -> apply);
// drain a few before asserting. done() is proven to have run by the exit guard below.
(async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  checks([[state.sptVersion === "4.1.1", "auto-fill takes newest stable 4.1.x, got " + state.sptVersion]]);
  done();
})();
`;
ctx.checks = (rows) => rows.forEach(([c, m]) => assert(c, m));
// The last block is async, so it finishes after runInContext returns. Without this guard
// a check that never ran would look identical to a passing run.
let finished = false;
ctx.done = () => { finished = true; console.log("PASS"); };
process.on("exit", (code) => {
  if (code === 0 && !finished) { console.error("FAIL: async checks never completed"); process.exitCode = 1; }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8") + epilogue, ctx);
