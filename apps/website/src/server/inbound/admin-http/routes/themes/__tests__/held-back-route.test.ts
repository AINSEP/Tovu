import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminHeldBackThemeRoutes, type HeldBackRouteDeps } from "../held-back.js";

/**
 * @file `GET|POST .../held-back-themes[/check|/restore]` — the Themes screen's "Held back on import"
 * section. Bare app + stubbed principal over a scratch site folder whose `.import-quarantine/`
 * holds one good theme, two still-bad ones and a non-theme plugin tree, beside one live theme.
 */

const WORKSPACE_ID = "workspace-local";
const FIXTURE = path.resolve(import.meta.dirname, "../../../../../../../../../development/fixtures/themes/minimal-declarative");
const GOOD = "declarative/minimal-declarative";

function copyTheme(required: { to: string; id: string; tier?: string }) {
  fs.cpSync(FIXTURE, required.to, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(required.to, "theme.json"), "utf8"));
  fs.writeFileSync(path.join(required.to, "theme.json"), JSON.stringify({ ...manifest, id: required.id, tier: required.tier ?? manifest.tier }));
}

function buildSite() {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-held-back-route-"));
  const themesDir = path.join(siteDir, "themes");
  const held = path.join(siteDir, ".import-quarantine");
  copyTheme({ to: path.join(themesDir, "declarative", "live-one"), id: "live-one" });
  copyTheme({ to: path.join(held, "themes", GOOD), id: "minimal-declarative" });
  copyTheme({ to: path.join(held, "themes", "declarative", "bad-tier"), id: "bad-tier", tier: "static" });
  copyTheme({ to: path.join(held, "themes", "declarative", "has-code"), id: "has-code" });
  fs.writeFileSync(path.join(held, "themes", "declarative", "has-code", "server.ts"), "export {};\n");
  fs.mkdirSync(path.join(held, "plugins", "some-plugin"), { recursive: true });
  fs.writeFileSync(path.join(held, "plugins", "some-plugin", "index.js"), "1;\n");
  return { siteDir, themesDir, held };
}

function buildApp(options: { allowed?: (permission: string) => boolean; activeThemeId?: string } = {}) {
  const site = buildSite();
  const themes = discoverAllBuiltInThemes({ dir: site.themesDir, source: "built-in" });
  const permissions: string[] = [];
  const presentation = { activeThemeId: options.activeThemeId ?? "live-one", saved: 0 };
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async (req: { permission: string }) => {
      permissions.push(req.permission);
      return (options.allowed ?? (() => true))(req.permission) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "no-grant" };
    },
    themes,
    themesDir: site.themesDir,
    siteBinding: { dir: site.siteDir },
    presentationRepo: {
      findByWorkspaceId: async () => ({ workspaceId: WORKSPACE_ID, activeThemeId: presentation.activeThemeId, updatedAt: "" }),
      save: async () => { presentation.saved += 1; },
      listAll: async () => [],
    },
  } as unknown as HeldBackRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminHeldBackThemeRoutes({ app, deps });
  return { app, themes, permissions, presentation, ...site };
}

async function call(t: import("node:test").TestContext, app: express.Express, options: { path?: string; body?: unknown } = {}) {
  const baseUrl = await startTestServer(app, t);
  const url = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/held-back-themes${options.path ?? ""}`;
  const res = options.body === undefined ? await fetch(url) : await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(options.body) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

/** Every file under `dir` → sha256, so "byte-for-byte untouched" is a single deepEqual. */
function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const rel of (fs.readdirSync(dir, { recursive: true }) as string[]).sort()) {
    const abs = path.join(dir, rel);
    if (fs.lstatSync(abs).isFile()) out[rel] = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  }
  return out;
}

async function approvedDigest(t: import("node:test").TestContext, app: express.Express, themeId = GOOD): Promise<string> {
  const { json } = await call(t, app, { path: "/check", body: { themeId } });
  return json.digest;
}

test("held-back list: names every quarantined theme tree and nothing else", async (t) => {
  const { app, permissions } = buildApp();
  const { status, json } = await call(t, app);
  assert.equal(status, 200);
  assert.deepEqual(json.themes.map((theme: { id: string }) => theme.id), ["declarative/bad-tier", "declarative/has-code", GOOD]);
  const good = json.themes.find((theme: { id: string }) => theme.id === GOOD);
  assert.deepEqual({ ...good, bytes: undefined }, { id: GOOD, name: "Minimal Declarative", tier: "declarative", original: false, files: 5, bytes: undefined });
  assert.ok(good.bytes > 0);
  assert.equal(json.chosenThemeHeldBack, null);
  assert.deepEqual(permissions, ["theme.set"]);

  const empty = buildApp();
  fs.rmSync(empty.held, { recursive: true });
  const none = await call(t, empty.app);
  assert.equal(none.status, 200);
  assert.deepEqual(none.json.themes, []);
});

test("held-back re-check refused on a still-bad manifest", async (t) => {
  const { app } = buildApp();
  const tier = await call(t, app, { path: "/check", body: { themeId: "declarative/bad-tier" } });
  assert.equal(tier.status, 200);
  assert.equal(tier.json.passes, false);
  assert.equal(tier.json.digest, null);
  assert.match(tier.json.problems.join(" "), /says it is a static theme, but it sits in the declarative folder/);

  const code = await call(t, app, { path: "/check", body: { themeId: "declarative/has-code" } });
  assert.equal(code.json.passes, false);
  assert.equal(code.json.digest, null);
  assert.match(code.json.problems.join(" "), /server\.ts/);

  const good = await call(t, app, { path: "/check", body: { themeId: GOOD } });
  assert.deepEqual({ ...good.json, digest: typeof good.json.digest }, { themeId: GOOD, passes: true, problems: [], digest: "string", nameTaken: false });

  assert.equal((await call(t, app, { path: "/check", body: { themeId: "../x" } })).json.code, "INVALID_ID");
  assert.equal((await call(t, app, { path: "/check", body: { themeId: "static/nope" } })).status, 404);
});

test("held-back restore requires approval", async (t) => {
  const { app, held, themesDir } = buildApp();
  const missing = await call(t, app, { path: "/restore", body: { themeId: GOOD } });
  assert.equal(missing.status, 400);
  assert.equal(missing.json.code, "APPROVAL_REQUIRED");
  assert.ok(fs.existsSync(path.join(held, "themes", GOOD, "theme.json")));

  const wrong = await call(t, app, { path: "/restore", body: { themeId: GOOD, approvedDigest: "0".repeat(64) } });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.json.code, "CHANGED_SINCE_CHECK");

  const bad = await call(t, app, { path: "/restore", body: { themeId: "declarative/bad-tier", approvedDigest: "0".repeat(64) } });
  assert.equal(bad.status, 409);
  assert.equal(bad.json.code, "CHECK_FAILED");
  assert.ok(bad.json.problems.length > 0);
  assert.ok(fs.existsSync(path.join(held, "themes", "declarative", "bad-tier", "theme.json")));
  assert.equal(fs.existsSync(path.join(themesDir, "declarative", "bad-tier")), false);
  assert.equal(fs.existsSync(path.join(themesDir, GOOD)), false);

  const noEdit = buildApp({ allowed: (permission) => permission !== "theme.edit" });
  const digest = await approvedDigest(t, noEdit.app);
  const forbidden = await call(t, noEdit.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: digest } });
  assert.equal(forbidden.status, 403);
  assert.ok(fs.existsSync(path.join(noEdit.held, "themes", GOOD, "theme.json")));
});

test("held-back restore moves only that theme", async (t) => {
  const { app, held, themesDir, themes, presentation, siteDir } = buildApp();
  fs.writeFileSync(path.join(held, "held-back-choice.json"), JSON.stringify({ chosenThemeId: GOOD, fallbackThemeId: "live-one" }));
  const heldBefore = hashTree(held);
  const liveBefore = hashTree(themesDir);
  const digest = await approvedDigest(t, app);

  const { status, json } = await call(t, app, { path: "/restore", body: { themeId: GOOD, approvedDigest: digest } });
  assert.equal(status, 201);
  assert.deepEqual(json, { theme: { id: "minimal-declarative", name: "Minimal Declarative", status: "valid" }, restoredFrom: GOOD });
  assert.ok(themes.some((theme) => theme.manifest.id === "minimal-declarative"));
  assert.equal(presentation.saved, 0);

  const moved = Object.fromEntries(Object.entries(heldBefore).filter(([rel]) => rel.startsWith("themes/" + GOOD + "/")).map(([rel, hash]) => [rel.slice("themes/".length), hash]));
  const heldStays = Object.fromEntries(Object.entries(heldBefore).filter(([rel]) => !rel.startsWith("themes/" + GOOD + "/") && rel !== "held-back-choice.json"));
  assert.deepEqual(hashTree(held), heldStays);
  // `.preview-refresh.json` is the requested preview refresh (contract), not theme content.
  const { [".preview-refresh.json"]: refresh, ...liveAfter } = hashTree(themesDir);
  assert.ok(refresh);
  assert.deepEqual(liveAfter, { ...liveBefore, ...moved });

  // A marker naming a different theme survives a restore.
  const other = buildApp();
  const marker = JSON.stringify({ chosenThemeId: "declarative/bad-tier", fallbackThemeId: "live-one" });
  fs.writeFileSync(path.join(other.held, "held-back-choice.json"), marker);
  await call(t, other.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: await approvedDigest(t, other.app) } });
  assert.equal(fs.readFileSync(path.join(other.held, "held-back-choice.json"), "utf8"), marker);

  // The live folder already existing is a 409 NAME_TAKEN and nothing moves.
  const taken = buildApp();
  copyTheme({ to: path.join(taken.themesDir, GOOD), id: "minimal-declarative" });
  const check = await call(t, taken.app, { path: "/check", body: { themeId: GOOD } });
  assert.equal(check.json.nameTaken, true);
  const refused = await call(t, taken.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: check.json.digest } });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.code, "NAME_TAKEN");
  assert.ok(fs.existsSync(path.join(taken.held, "themes", GOOD, "theme.json")));
  assert.ok(siteDir);
});

test("held-back notice shown when the site's chosen theme was held back", async (t) => {
  const marker = JSON.stringify({ chosenThemeId: GOOD, fallbackThemeId: "live-one" });
  const shown = buildApp({ activeThemeId: "live-one" });
  fs.writeFileSync(path.join(shown.held, "held-back-choice.json"), marker);
  assert.deepEqual((await call(t, shown.app)).json.chosenThemeHeldBack, { themeId: GOOD, name: "Minimal Declarative", fallbackThemeId: "live-one" });

  const movedOn = buildApp({ activeThemeId: "something-else" });
  fs.writeFileSync(path.join(movedOn.held, "held-back-choice.json"), marker);
  assert.equal((await call(t, movedOn.app)).json.chosenThemeHeldBack, null);

  await call(t, shown.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: await approvedDigest(t, shown.app) } });
  assert.equal((await call(t, shown.app)).json.chosenThemeHeldBack, null);
});
