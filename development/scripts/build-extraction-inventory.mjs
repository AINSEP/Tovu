// One-off generator for the Gate B seed (`development/boundaries/extraction-inventory.json`). Never run in CI:
// the checked-in file is the authority once reviewed, and later changes are hand edits the gate validates.
//
// Inputs, read with `git show <planSha>:…` because the integration tree has no `plans/` directory:
//   plans/P9-data/k-work.json        whole-file rows {f, step, area, dest, k}          -> scope "bound"
//   plans/P9-data/stays-in-tovu.md   host-owned files in Jini-bound directories         -> scope "host"
//   plans/P9-data/k-data.json        K4 seam targets and the type names that move       -> scope "mixed"
//   plans/P9-steps/K4-seam-*.md      the Jini destination of each seam target
//   plans/P9-data/areas-and-steps.json + k-data.json steps  -> step lanes, for `owner`
// Then it applies, in order: the GB.1 theme exclusions, the GB.2 overlay rows, and the approved ex2 overlays
// (ex2-holds-tovu P0.T and SH-3, ex2-tovu-halves K4-seam-1 and K4-i18n-common), and finally derives
// `boundRoots` from the live tree. Output is deterministic: rows sorted by path, one row per line.
//
//   node development/scripts/build-extraction-inventory.mjs [--root <repo>] [--write]
// Without --write the JSON goes to stdout; a summary always goes to stderr.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { INVENTORY_FILE, THEME_DISPOSITION } from "./lib/extraction-inventory.mjs";

const PLAN_SHA = "a65df40afd337f49e9be6fb86e200e96cd1df292";
const THEME_ROOTS = ["apps/website/src/features/theme/", "apps/admin/src/features/themes/", "apps/admin/src/features/admin-themes/", "apps/website/src/server/inbound/admin-http/routes/themes/"];
const FORBIDDEN_ROOTS = [
  "apps/website/src/server/routes/types.ts",
  "apps/website/src/server/routes/route-deps/",
  "apps/website/src/platform/",
  "apps/website/src/server/runtime/composition/",
  "apps/admin/src/integrations/",
  "apps/admin/src/lib/admin-http/",
];
const STAYS = "stays-in-tovu";

// GB.1 "other-area rows": theme-owned files labelled under other areas at the plan SHA (34 rows).
const GB1_OTHER_AREA = [
  ...["AdminThemes.tsx", "admin-themes-i18n.ts", "admin-themes.css", "index.ts"].map((n) => `apps/admin/src/features/admin-themes/${n}`),
  ...["ThemePageDetailsModal.hooks.tsx", "ThemePageDetailsModal.tsx", "ThemePagesTab.tsx"].map((n) => `apps/admin/src/features/pages/${n}`),
  ...["theme-canvas-dependencies.hooks.ts", "theme-canvas-port.hooks.ts", "theme-canvas-wrapper.ts", "theme-pages-dependencies.hooks.ts", "theme-pages-port.hooks.ts", "use-theme-canvas-styling.hooks.ts", "use-theme-pages.hooks.ts"].map(
    (n) => `apps/admin/src/features/pages/hooks/${n}`,
  ),
  "apps/admin/src/features/pages/lib/theme-page-publish-state.ts",
  "apps/admin/src/features/plugins/admin-surface-theme.ts",
  "apps/website/src/features/presentation/set-active-theme.ts",
  "apps/website/src/features/site-export/theme-preview-manifest.ts",
  "apps/website/src/features/site-export/theme-preview-report.ts",
  "apps/website/src/features/trash/adapters/theme.ts",
  "apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts",
  "apps/website/src/server/inbound/admin-http/routes/presentation/rescan-themes.ts",
  ...["duplicate", "explore", "list", "preview"].map((n) => `apps/website/src/server/inbound/admin-http/routes/themes/${n}.ts`),
  ...["render-theme-override", "theme-asset-dirs", "theme-content-security-headers", "theme-page-preview", "theme-preview-refresh", "theme-preview-static", "theme-preview-switcher", "theme-static-assets"].map(
    (n) => `apps/website/src/server/inbound/public-http/middleware/${n}.ts`,
  ),
];
const GB1_EXACT = ["apps/website/src/contracts/core/tool-metadata/theme.ts"];

// GB.2: approved since the plan SHA. request.ts splits along cut #4: the stages it names
// (request.ts:129–154, 225–250, 336–405, 425–445) become `createAdminHttp`; the host keeps ApiError,
// describeApiError, the listener registry, the error-code constants, and re-binds the operations it exports.
const GB2 = {
  "apps/admin/src/lib/admin-http/config.ts": { scope: "host", dest: null, disposition: "host-owned: rv-g FIX 2 (Jini c54d9e24) keeps the workspace and URL constants in the host" },
  "apps/admin/src/lib/admin-http/urls.ts": { scope: "host", dest: null, disposition: "host-owned: cut #4 keeps it at its path because the route-check script reads it" },
  "apps/admin/src/lib/admin-http/request.ts": {
    scope: "mixed",
    dest: "@jini-ai/admin/shell/lib/admin-http/request#createAdminHttp",
    disposition: "mixed: cut #4 moves the request behavior into createAdminHttp; the host composition, ApiError, describeApiError and the listener registry stay",
    hostSymbols: ["API_UNREACHABLE_CODE", "ApiError", "AuthenticatedAdminRequestOptions", "KEEPALIVE_MAX_BODY_BYTES", "REQUEST_TIMEOUT_CODE", "bodyFitsKeepalive", "describeApiError", "onUnauthenticated"],
    movedSymbols: ["authenticatedAdminRequest", "buildFetchInit", "fetchOrThrowUnreachable", "request", "requestOnce", "requestRidingOutRestart"],
  },
  "apps/website/src/platform/html/escape.ts": { scope: "retired", dest: "@jini-ai/core/text", disposition: "retired: cut #7 retires it to @jini-ai/core/text (file pending deletion by cut #7)" },
  "apps/website/src/platform/html/slug.ts": { scope: "retired", dest: "@jini-ai/cms/html/site/slug", disposition: "retired: cut #7, identical blob already in CMS (file pending deletion by cut #7)" },
};

// Approved overlays merged into this tree after the plan SHA (cloud-results/ex2-holds-tovu.md, ex2-tovu-halves.md).
const P0T = "P0.T a79fb87dc";
const OVERLAY_ROWS = [
  { path: "apps/admin/src/features/settings/api/settings-api.ts", scope: "retired", dest: "apps/admin/src/lib/admin-http/settings-api.ts", disposition: `retired: host relocation (${P0T}) to apps/admin/src/lib/admin-http/settings-api.ts` },
  { path: "apps/admin/src/features/settings/api/settings-api.types.ts", scope: "retired", dest: "@jini-ai/admin/core#SettingValueResponse", disposition: `retired: host relocation (${P0T}), then deleted by the P0.T residual; type is @jini-ai/admin/core SettingValueResponse` },
  { path: "apps/admin/src/lib/admin-http/settings-api.ts", step: "P0.T", area: "adm-other", scope: "host", dest: null, disposition: `host relocation: ${P0T} from apps/admin/src/features/settings/api/settings-api.ts` },
  { path: "apps/admin/src/lib/admin-http/settings-api.types.ts", step: "P0.T", area: "adm-other", scope: "retired", dest: "@jini-ai/admin/core#SettingValueResponse", disposition: "retired: P0.T residual deletes it; the type is @jini-ai/admin/core SettingValueResponse" },
  ...["host", "store", "vault-repo"].map((name) => ({
    path: `apps/website/src/features/custom-credentials/sets/${name}.ts`, step: "SH-3", area: "custom-credentials", scope: "retired", dest: "@jini-ai/integrations/credentialed-http/sets",
    disposition: "retired: SH-3 e37955220 deleted the re-export forwarder; consumers import @jini-ai/integrations/credentialed-http/sets",
  })),
  {
    path: "apps/website/src/contracts/core/tool-metadata/approval-policy.ts", step: "K4-seam-1", area: "contracts-core", scope: "retired", dest: "@jini-ai/core/contracts/site/tool-metadata-approval-policy",
    movedSymbols: ["ToolApprovalClass", "ToolApprovalPolicy"], disposition: "retired: K4-seam-1.T (e86ecf24e2, deletion in 71a1bcd725); the host specialization stays in tool-metadata/index.ts",
  },
  {
    path: "apps/admin/src/lib/i18n-common.ts", step: "K4-i18n-common", area: "adm-shell-lib", scope: "host", dest: null,
    disposition: "stays-in-tovu: local i18n binding retained (K4-i18n-common.T c55d79a916); the generic dictionary is @jini-ai/admin/core/i18n-common",
  },
];
// K4-seam-1.T left the host specialization beside the bound projection, so the bound row becomes mixed.
const HALVES_MIXED = {
  path: "apps/website/src/contracts/core/tool-metadata/index.ts",
  hostSymbols: ["HostToolApprovalPolicy", "HostToolApprovalRule"],
  disposition: "mixed: K4-seam-1.T (e86ecf24e2) retains the host specialization here; ToolApprovalPolicy/ToolApprovalClass are @jini-ai/core/contracts/site/tool-metadata-approval-policy",
};

function gitShow(required, _optional = {}) {
  return execFileSync("git", ["show", `${required.sha}:${required.file}`], { cwd: required.root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Seam target -> Jini destination, parsed from the K4-seam step tables. */
function readSeamDestinations(required, _optional = {}) {
  const { root, sha } = required;
  const files = execFileSync("git", ["ls-tree", "--name-only", sha, "plans/P9-steps/"], { cwd: root, encoding: "utf8" }).split("\n").filter((f) => /\/K4-seam-\d+\.md$/.test(f));
  const destinations = new Map();
  for (const file of files) {
    for (const match of gitShow({ root, sha, file }).matchAll(/^\| `([^`]+)` \|[^|]*\|[^|]*\|[^|]*\| `([^`]+)`/gm)) destinations.set(match[1], match[2]);
  }
  return destinations;
}

function readPlanData(required, _optional = {}) {
  const { root, sha } = required;
  const read = (name) => gitShow({ root, sha, file: `plans/P9-data/${name}` });
  const kData = JSON.parse(read("k-data.json"));
  const steps = [...JSON.parse(read("areas-and-steps.json")).steps, ...kData.steps];
  const stays = [...read("stays-in-tovu.md").matchAll(/^\| `([^`]+)` \| \d+ \| .* \|$/gm)].map((m) => m[1]);
  return { work: JSON.parse(read("k-work.json")), kData, lanes: new Map(steps.map((s) => [s.id, s.lane])), stays, seamDestinations: readSeamDestinations({ root, sha }) };
}

/**
 * Area for a file P9 did not row (host and seam files): the most common P9 area among whole-file rows in the
 * file's own directory subtree. Climbing further would borrow a sibling's label (platform/http -> platform-mail),
 * so without one the area is the feature or top-level folder name under src/.
 */
function areaIndex(required, _optional = {}) {
  const counts = new Map();
  for (const row of required.work) {
    const parts = row.f.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = `${parts.slice(0, depth).join("/")}/`;
      const tally = counts.get(dir) ?? new Map();
      tally.set(row.area, (tally.get(row.area) ?? 0) + 1);
      counts.set(dir, tally);
    }
  }
  return (file) => {
    const tally = counts.get(`${path.posix.dirname(file)}/`);
    if (tally) return [...tally].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    const match = /\/src\/(?:features\/)?([^/]+)\//.exec(file);
    if (file.startsWith("apps/desktop/")) return "desktop";
    return match ? match[1] : file.split("/")[1];
  };
}

/** Builds a row with a fixed key order, so the output bytes do not depend on how a row was assembled. */
function makeRow(required, _optional = {}) {
  const { lanes, areaOf } = required;
  const spec = required.spec;
  const area = spec.area ?? areaOf(spec.path);
  const lane = spec.step ? (lanes.get(spec.step) ?? spec.step.split("-")[0]) : "tovu-host";
  const row = { path: spec.path, step: spec.step ?? null, area, dest: spec.dest ?? null, k: spec.k ?? [], scope: spec.scope, disposition: spec.disposition, owner: `${lane}/${area}` };
  if (spec.hostSymbols) row.hostSymbols = [...spec.hostSymbols].sort();
  if (spec.movedSymbols) row.movedSymbols = [...spec.movedSymbols].sort();
  return row;
}

/** Named exports of a TS/JS module (regex level: enough for the seed's mixed files, all checked by hand). */
function exportsOf(required, _optional = {}) {
  const text = required.source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const names = new Set();
  const declaration = /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of text.matchAll(declaration)) names.add(match[1]);
  for (const match of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of match[1].split(",").map((p) => p.trim().replace(/^type\s+/, "")).filter(Boolean)) names.add(part.split(/\s+as\s+/).pop().trim());
  }
  for (const match of text.matchAll(/^export\s+\*\s+(?:as\s+(\w+)\s+)?from\s+["']([^"']+)["']/gm)) names.add(match[1] ?? `* from ${match[2]}`);
  return [...names].sort();
}

function seedRows(required, _optional = {}) {
  const { data, build } = required;
  const rows = new Map();
  for (const r of data.work) rows.set(r.f, build({ path: r.f, step: r.step, area: r.area, dest: r.dest, k: r.k, scope: "bound", disposition: "moves" }));
  for (const file of data.stays) rows.set(file, build({ path: file, scope: "host", disposition: STAYS }));
  return rows;
}

/** GB.1: every theme-owned row is host with the owner's disposition; its planned destination is dropped. */
function applyThemes(required, _optional = {}) {
  const { rows, build } = required;
  const themed = [...rows.keys()].filter((p) => THEME_ROOTS.some((root) => p.startsWith(root)) || GB1_OTHER_AREA.includes(p) || GB1_EXACT.includes(p));
  const missing = [...GB1_OTHER_AREA, ...GB1_EXACT].filter((p) => !rows.has(p));
  if (missing.length) throw new Error(`GB.1 rows absent from k-work: ${missing.join(", ")}`);
  for (const p of themed) {
    const old = rows.get(p);
    rows.set(p, build({ path: p, step: old.step, area: old.area, k: old.k, scope: "host", disposition: THEME_DISPOSITION }));
  }
  return themed.length;
}

/** Overlays replace a row's scope fields; step/area/k come from the P9 row when the overlay omits them. */
function applyOverlay(required, _optional = {}) {
  const { rows, build, spec } = required;
  const old = rows.get(spec.path);
  rows.set(spec.path, build({ step: old?.step, area: old?.area, k: old?.k, ...spec }));
}

/** K4 seam targets on disk become mixed: the named types move to core, every other export stays. */
function applySeams(required, _optional = {}) {
  const { rows, build, data, root } = required;
  const skipped = [];
  for (const seam of data.kData.seam) {
    for (const target of seam.targets.filter((t) => !t.jini)) {
      const file = path.join(root, target.t);
      if (!target.t.startsWith("apps/") || !fs.existsSync(file)) {
        skipped.push(`${seam.id} ${target.t}`);
        continue;
      }
      const exported = exportsOf({ source: fs.readFileSync(file, "utf8") });
      const hostSymbols = exported.filter((name) => !target.names.includes(name));
      const disposition = `mixed: ${seam.id} moves the types ${target.names.join(", ")} to core; values and policy stay in Tovu`;
      applyOverlay({ rows, build, spec: { path: target.t, step: seam.id, area: rows.get(target.t)?.area, dest: data.seamDestinations.get(target.t), scope: "mixed", disposition, hostSymbols, movedSymbols: target.names } });
    }
  }
  return skipped;
}

function applyApprovedOverlays(required, _optional = {}) {
  const { rows, build, root } = required;
  for (const [p, spec] of Object.entries(GB2)) applyOverlay({ rows, build, spec: { path: p, ...spec } });
  for (const spec of OVERLAY_ROWS) applyOverlay({ rows, build, spec });
  const index = rows.get(HALVES_MIXED.path);
  const exported = exportsOf({ source: fs.readFileSync(path.join(root, HALVES_MIXED.path), "utf8") });
  const movedSymbols = exported.filter((name) => !HALVES_MIXED.hostSymbols.includes(name));
  applyOverlay({ rows, build, spec: { ...HALVES_MIXED, dest: index.dest, scope: "mixed", movedSymbols } });
}

const PRODUCTION = /\.(?:[cm]?[jt]sx?|css)$/;
const NOT_PRODUCTION = /(^|\/)(__tests__|__mocks__|__fixtures__|fixtures)\/|\.(test|spec)\.[^/]+$|\.d\.[cm]?ts$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "release", "coverage", ".vite", ".turbo"]);

function listProductionFiles(required, _optional = {}) {
  const { root, dir } = required;
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) files.push(...listProductionFiles({ root, dir: rel }));
    else if (entry.isFile() && PRODUCTION.test(entry.name) && !NOT_PRODUCTION.test(rel)) files.push(rel);
  }
  return files;
}

/**
 * The widest directories (at least `apps/<app>/src/<dir>/` deep) whose every production file is a bound
 * row. New files there enter scope automatically; directories with any host, mixed, retired-but-present or
 * unlisted file are left to exact rows, so their generic neighbours stay covered row by row.
 */
function computeBoundRoots(required, _optional = {}) {
  const { rows, files } = required;
  const tally = new Map();
  for (const file of files) {
    const bound = rows.get(file)?.scope === "bound";
    const parts = file.split("/");
    for (let depth = 4; depth < parts.length; depth++) {
      const dir = `${parts.slice(0, depth).join("/")}/`;
      const t = tally.get(dir) ?? { total: 0, bound: 0 };
      t.total += 1;
      t.bound += bound ? 1 : 0;
      tally.set(dir, t);
    }
  }
  const qualifies = (dir) => tally.get(dir)?.total === tally.get(dir)?.bound;
  const roots = [...tally.keys()].filter(qualifies).filter((dir) => !THEME_ROOTS.some((theme) => dir.startsWith(theme) || theme.startsWith(dir)));
  return roots.filter((dir) => !roots.some((other) => other !== dir && dir.startsWith(other))).sort();
}

function assertLiveRows(required, _optional = {}) {
  const gone = [...required.rows.values()].filter((row) => row.scope !== "retired" && !fs.existsSync(path.join(required.root, row.path)));
  if (gone.length) throw new Error(`rows whose file is gone (retire them with a destination first):\n${gone.map((r) => r.path).join("\n")}`);
}

function serialize(required, _optional = {}) {
  const { inventory } = required;
  const list = (items) => `[\n${items.map((item) => `    ${JSON.stringify(item)}`).join(",\n")}\n  ]`;
  return [
    "{",
    `  "_comment": ${JSON.stringify(inventory._comment)},`,
    `  "planSha": ${JSON.stringify(inventory.planSha)},`,
    `  "themeRoots": ${list(inventory.themeRoots)},`,
    `  "forbiddenRoots": ${list(inventory.forbiddenRoots)},`,
    `  "boundRoots": ${list(inventory.boundRoots)},`,
    `  "rows": ${list(inventory.rows)}`,
    "}",
    "",
  ].join("\n");
}

const COMMENT =
  "Gate B extraction inventory. Seeded by development/scripts/build-extraction-inventory.mjs from plans/P9-data at planSha, " +
  "with GB.1 theme exclusions, GB.2 overlays and the ex2 overlays applied. scope: bound = whole file moves to dest; mixed = movedSymbols move to dest, hostSymbols stay; " +
  "host = stays in Tovu (disposition says why); retired = gone, dest says where. Validated by development/scripts/lib/extraction-inventory.mjs.";

export function buildInventory(required, _optional = {}) {
  const { root } = required;
  const data = readPlanData({ root, sha: PLAN_SHA });
  const areaOf = areaIndex({ work: data.work });
  const build = (spec) => makeRow({ spec, lanes: data.lanes, areaOf });
  const rows = seedRows({ data, build });
  const themed = applyThemes({ rows, build });
  const skippedSeams = applySeams({ rows, build, data, root });
  applyApprovedOverlays({ rows, build, root });
  assertLiveRows({ rows, root });
  const files = ["apps"].flatMap((dir) => listProductionFiles({ root, dir }));
  const boundRoots = computeBoundRoots({ rows, files });
  const sorted = [...rows.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const inventory = { _comment: COMMENT, planSha: PLAN_SHA, themeRoots: THEME_ROOTS, forbiddenRoots: FORBIDDEN_ROOTS, boundRoots, rows: sorted };
  return { inventory, themed, skippedSeams };
}

function main(required, _optional = {}) {
  const argv = required.argv;
  const rootFlag = argv.indexOf("--root");
  const root = path.resolve(rootFlag >= 0 ? argv[rootFlag + 1] : ".");
  const { inventory, themed, skippedSeams } = buildInventory({ root });
  const text = serialize({ inventory });
  if (argv.includes("--write")) fs.writeFileSync(path.join(root, INVENTORY_FILE), text);
  else process.stdout.write(text);
  const byScope = Object.groupBy(inventory.rows, (row) => row.scope);
  const counts = Object.entries(byScope).map(([scope, list]) => `${scope}=${list.length}`).sort().join(" ");
  console.error(`rows=${inventory.rows.length} ${counts} theme-host=${themed} boundRoots=${inventory.boundRoots.length}`);
  for (const seam of skippedSeams) console.error(`skipped seam target (not a local file): ${seam}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // exitCode, not exit(): exit() would cut off a large stdout write to a pipe.
  process.exitCode = main({ argv: process.argv.slice(2) });
}
