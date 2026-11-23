// Tests for the Gate B extraction inventory library (`development/scripts/lib/extraction-inventory.mjs`)
// and for the checked-in seed (`development/boundaries/extraction-inventory.json`).
//
//   node --test development/scripts/__tests__/extraction-inventory.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPath, isForbiddenTarget, loadInventory, validateInventory } from "../lib/extraction-inventory.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const THEME = "stays: owner 2026-11-22";
const THEME_ROOTS = [
  "apps/website/src/features/theme/",
  "apps/admin/src/features/themes/",
  "apps/admin/src/features/admin-themes/",
  "apps/website/src/server/inbound/admin-http/routes/themes/",
];
const FORBIDDEN_ROOTS = [
  "apps/website/src/server/routes/types.ts",
  "apps/website/src/server/routes/route-deps/",
  "apps/website/src/platform/",
  "apps/website/src/server/runtime/composition/",
  "apps/admin/src/integrations/",
  "apps/admin/src/lib/admin-http/",
];

function boundRow(rowPath, extra = {}) {
  return { path: rowPath, step: "A-K2-demo-1", area: "demo", dest: `packages/admin/src/${path.basename(rowPath)}`, k: [], scope: "bound", disposition: "moves", owner: "A-K2/demo", ...extra };
}

function inventoryOf(rows, extra = {}) {
  return { _comment: "fixture", planSha: "a65df40afd337f49e9be6fb86e200e96cd1df292", themeRoots: THEME_ROOTS, forbiddenRoots: FORBIDDEN_ROOTS, boundRoots: ["apps/admin/src/features/demo/"], rows, ...extra };
}

/** A temp repo holding `files` (repo-relative path -> text). The caller removes it. */
function workspace(files) {
  const root = mkdtempSync(path.join(tmpdir(), "extraction-inventory-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test("classifies a file inside each theme root as host-owned", () => {
  const inventory = inventoryOf([]);
  for (const root of THEME_ROOTS) {
    const result = classifyPath({ inventory, path: `${root}brand-new-theme-file.ts` });
    assert.equal(result.scope, "host", root);
    assert.equal(result.disposition, THEME, root);
  }
  assert.equal(classifyPath({ inventory, path: "apps/admin/src/features/theme-like/x.ts" }).scope, "out");
});

test("fails validation for a bound row pointing into a theme root", () => {
  const themePath = "apps/admin/src/features/admin-themes/AdminThemes.tsx";
  const root = workspace({ [themePath]: "export {};\n", "apps/admin/src/features/demo/a.ts": "export {};\n" });
  try {
    const inventory = inventoryOf([boundRow(themePath), boundRow("apps/admin/src/features/demo/a.ts")]);
    const errors = validateInventory({ inventory, root });
    assert.ok(errors.some((e) => e.includes("bound row inside theme root") && e.includes(themePath)), errors.join("\n"));
    const mixed = inventoryOf([boundRow(themePath, { scope: "mixed", hostSymbols: ["A"], movedSymbols: ["B"] })]);
    assert.ok(validateInventory({ inventory: mixed, root }).some((e) => e.includes("bound row inside theme root")));
    const host = inventoryOf([boundRow(themePath, { scope: "host", dest: null, disposition: THEME })]);
    assert.deepEqual(validateInventory({ inventory: host, root }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exact row beats a root rule", () => {
  const themePath = "apps/website/src/features/theme/split-generic-part.ts";
  const boundPath = "apps/admin/src/features/demo/kept-by-host.ts";
  const inventory = inventoryOf([
    boundRow(boundPath, { scope: "host", dest: null, disposition: "stays-in-tovu" }),
    boundRow(themePath, { scope: "retired", dest: "@jini-ai/cms/themes/split" }),
  ]);
  assert.equal(classifyPath({ inventory, path: boundPath }).scope, "host");
  assert.equal(classifyPath({ inventory, path: boundPath }).row.disposition, "stays-in-tovu");
  assert.equal(classifyPath({ inventory, path: themePath }).scope, "retired");
});

test("new file under a bound root enters scope with no row", () => {
  const inventory = inventoryOf([boundRow("apps/admin/src/features/demo/a.ts")]);
  const result = classifyPath({ inventory, path: "apps/admin/src/features/demo/nested/new-file.ts" });
  assert.equal(result.scope, "bound");
  assert.equal(result.row, undefined);
  assert.equal(classifyPath({ inventory, path: "apps/admin/src/features/demo-sibling/x.ts" }).scope, "out");
  assert.equal(classifyPath({ inventory, path: "./apps/admin/src/features/demo/a.ts" }).row.path, "apps/admin/src/features/demo/a.ts");
});

test("rejects a dropped inventory row and a narrowed root against the base", () => {
  const files = { "apps/admin/src/features/demo/a.ts": "export {};\n", "apps/admin/src/features/demo/b.ts": "export {};\n" };
  const root = workspace(files);
  try {
    const base = inventoryOf([boundRow("apps/admin/src/features/demo/a.ts"), boundRow("apps/admin/src/features/demo/b.ts")]);
    assert.deepEqual(validateInventory({ inventory: base, root }, { base }), []);
    const dropped = inventoryOf([boundRow("apps/admin/src/features/demo/a.ts")]);
    assert.ok(validateInventory({ inventory: dropped, root }, { base }).some((e) => e.includes("dropped inventory row") && e.includes("demo/b.ts")));
    const retired = inventoryOf([boundRow("apps/admin/src/features/demo/a.ts"), boundRow("apps/admin/src/features/demo/b.ts", { scope: "retired" })]);
    assert.deepEqual(validateInventory({ inventory: retired, root }, { base }), []);
    const narrowed = { ...base, boundRoots: ["apps/admin/src/features/demo/sub/"] };
    assert.ok(validateInventory({ inventory: narrowed, root }, { base }).some((e) => e.includes("narrowed root")));
    const widened = { ...base, boundRoots: ["apps/admin/src/features/"] };
    assert.deepEqual(validateInventory({ inventory: widened, root }, { base }), []);
    const unforbidden = { ...base, forbiddenRoots: FORBIDDEN_ROOTS.slice(1) };
    assert.ok(validateInventory({ inventory: unforbidden, root }, { base }).some((e) => e.includes("forbidden root removed")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unknown keys, unsorted rows, a missing owner and a vanished file", () => {
  const root = workspace({ "apps/admin/src/features/demo/a.ts": "", "apps/admin/src/features/demo/b.ts": "" });
  try {
    const a = boundRow("apps/admin/src/features/demo/a.ts");
    const b = boundRow("apps/admin/src/features/demo/b.ts");
    const check = (inventory) => validateInventory({ inventory, root }).join("\n");
    assert.match(check({ ...inventoryOf([a, b]), extra: 1 }), /unknown key/);
    assert.match(check(inventoryOf([{ ...a, surprise: true }, b])), /unknown key/);
    assert.match(check(inventoryOf([b, a])), /unsorted/);
    assert.match(check(inventoryOf([a, a])), /duplicate/);
    assert.match(check(inventoryOf([{ ...a, owner: "" }, b])), /owner/);
    assert.match(check(inventoryOf([{ ...a, dest: null }, b])), /dest/);
    assert.match(check(inventoryOf([a, b, boundRow("apps/admin/src/features/demo/gone.ts")])), /no longer exists/);
    assert.equal(check(inventoryOf([a, b, boundRow("apps/admin/src/features/demo/gone.ts", { scope: "retired" })])), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exempts a root-internal edge but flags the same target from outside the root", () => {
  const inventory = inventoryOf([]);
  const target = "apps/admin/src/lib/admin-http/request.ts";
  assert.equal(isForbiddenTarget({ inventory, importer: "apps/admin/src/lib/admin-http/owner-mfa-api.ts", target }), false);
  assert.equal(isForbiddenTarget({ inventory, importer: "apps/admin/src/features/demo/a.ts", target }), true);
  const types = "apps/website/src/server/routes/types.ts";
  assert.equal(isForbiddenTarget({ inventory, importer: "apps/website/src/features/post/x.ts", target: types }), true);
  assert.equal(isForbiddenTarget({ inventory, importer: "apps/website/src/features/post/x.ts", target: "apps/website/src/server/routes/types-extra.ts" }), false);
  assert.equal(isForbiddenTarget({ inventory, importer: "apps/website/src/platform/http/a.ts", target: "apps/website/src/platform/html/escape.ts" }), false);
  assert.equal(isForbiddenTarget({ inventory, importer: "apps/website/src/platform/http/a.ts", target: "apps/admin/src/integrations/jini-kits.ts" }), true);
});

test("loadInventory throws on a missing or invalid file", () => {
  const root = workspace({ "development/boundaries/extraction-inventory.json": "{ not json" });
  try {
    assert.throws(() => loadInventory({ root }), /extraction-inventory\.json/);
    rmSync(path.join(root, "development"), { recursive: true, force: true });
    assert.throws(() => loadInventory({ root }), /extraction-inventory\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const GB1_OTHER_AREA = [
  "apps/admin/src/features/admin-themes/AdminThemes.tsx",
  "apps/admin/src/features/admin-themes/admin-themes-i18n.ts",
  "apps/admin/src/features/admin-themes/admin-themes.css",
  "apps/admin/src/features/admin-themes/index.ts",
  "apps/admin/src/features/pages/ThemePageDetailsModal.hooks.tsx",
  "apps/admin/src/features/pages/ThemePageDetailsModal.tsx",
  "apps/admin/src/features/pages/ThemePagesTab.tsx",
  "apps/admin/src/features/pages/hooks/theme-canvas-dependencies.hooks.ts",
  "apps/admin/src/features/pages/hooks/theme-canvas-port.hooks.ts",
  "apps/admin/src/features/pages/hooks/theme-canvas-wrapper.ts",
  "apps/admin/src/features/pages/hooks/theme-pages-dependencies.hooks.ts",
  "apps/admin/src/features/pages/hooks/theme-pages-port.hooks.ts",
  "apps/admin/src/features/pages/hooks/use-theme-canvas-styling.hooks.ts",
  "apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts",
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

test("the checked-in inventory validates and has exactly the GB.1 theme exclusions", () => {
  const inventory = loadInventory({ root: REPO_ROOT });
  assert.deepEqual(validateInventory({ inventory, root: REPO_ROOT }), []);
  assert.deepEqual(inventory.themeRoots, THEME_ROOTS);
  assert.deepEqual(inventory.forbiddenRoots, FORBIDDEN_ROOTS);
  const rows = new Map(inventory.rows.map((row) => [row.path, row]));
  const themeHost = (row) => row.scope === "host" && row.disposition === THEME;
  const under = (prefix) => inventory.rows.filter((row) => row.path.startsWith(prefix));
  assert.equal(under("apps/website/src/features/theme/").filter(themeHost).length, 85);
  assert.equal(under("apps/website/src/features/theme/").length, 85);
  assert.ok(themeHost(rows.get("apps/website/src/contracts/core/tool-metadata/theme.ts")));
  assert.equal(under("apps/admin/src/features/themes/").filter((row) => themeHost(row) && row.area === "adm-themes").length, 25);
  assert.equal(GB1_OTHER_AREA.length, 34);
  for (const rowPath of GB1_OTHER_AREA) assert.ok(themeHost(rows.get(rowPath)), rowPath);
  assert.equal(inventory.rows.filter(themeHost).length, 85 + 1 + 25 + 34);
  assert.equal(rows.get("apps/admin/src/lib/admin-http/config.ts").scope, "host");
  assert.match(rows.get("apps/admin/src/lib/admin-http/config.ts").disposition, /rv-g FIX 2/);
  assert.equal(rows.get("apps/admin/src/lib/admin-http/urls.ts").scope, "host");
  assert.match(rows.get("apps/admin/src/lib/admin-http/urls.ts").disposition, /cut #4/);
  const request = rows.get("apps/admin/src/lib/admin-http/request.ts");
  assert.equal(request.scope, "mixed");
  assert.ok(["ApiError", "describeApiError", "onUnauthenticated"].every((name) => request.hostSymbols.includes(name)));
  assert.match(request.dest, /createAdminHttp/);
  assert.deepEqual([rows.get("apps/website/src/platform/html/escape.ts").scope, rows.get("apps/website/src/platform/html/escape.ts").dest], ["retired", "@jini-ai/core/text"]);
  assert.deepEqual([rows.get("apps/website/src/platform/html/slug.ts").scope, rows.get("apps/website/src/platform/html/slug.ts").dest], ["retired", "@jini-ai/cms/html/site/slug"]);
  for (const root of inventory.boundRoots) assert.ok(!THEME_ROOTS.some((theme) => root.startsWith(theme) || theme.startsWith(root)), root);
});
