import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { buildGatewayDeps } from "#src/contracts/core/gated-mutations/composition";
import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminHeldBackThemeRoutes, type HeldBackRouteDeps } from "../held-back.js";

/**
 * @file `GET|POST .../held-back-themes[/check|/restore]` — the Themes screen's "Held back on import"
 * section. Bare app + stubbed principal over a scratch site folder whose `.import-quarantine/`
 * holds one good theme, two still-bad ones and a non-theme plugin tree, beside one live theme.
 * Restore needs two separate things: the check's digest (a version check) AND a host-minted
 * approval from the approval card (the gated-mutation confirmation token), bound to workspace,
 * actor, theme and digest. The `x-test-principal` header lets a test act as a second person.
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
  let serial = 0;
  const authorizeStub = async (req: { permission: string }) => {
    permissions.push(req.permission);
    return (options.allowed ?? (() => true))(req.permission) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "no-grant" };
  };
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: authorizeStub,
    themes,
    themesDir: site.themesDir,
    siteBinding: { dir: site.siteDir },
    gatedMutations: { gatewayDeps: buildGatewayDeps({ clock: { nowMs: () => Date.parse("2026-11-24T00:00:00Z"), nowIso: () => "2026-11-24T00:00:00.000Z" }, idGen: { newId: () => `plan-${++serial}` }, authorize: authorizeStub }) },
    presentationRepo: {
      findByWorkspaceId: async () => ({ workspaceId: WORKSPACE_ID, activeThemeId: presentation.activeThemeId, updatedAt: "" }),
      save: async () => { presentation.saved += 1; },
      listAll: async () => [],
    },
  } as unknown as HeldBackRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: req.get("x-test-principal") ?? "test-principal" };
    res.locals.authCredentialKind = "session";
    next();
  });
  registerAdminHeldBackThemeRoutes({ app, deps });
  return { app, themes, permissions, presentation, ...site };
}

async function call(t: import("node:test").TestContext, app: express.Express, options: { path?: string; body?: unknown; principal?: string } = {}) {
  const baseUrl = await startTestServer(app, t);
  const url = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/held-back-themes${options.path ?? ""}`;
  const headers: Record<string, string> = { "content-type": "application/json", ...(options.principal ? { "x-test-principal": options.principal } : {}) };
  const res = options.body === undefined ? await fetch(url, { headers }) : await fetch(url, { method: "POST", headers, body: JSON.stringify(options.body) });
  const text = await res.text();
  // A route that does not exist answers Express's HTML 404; keep the status, not a JSON crash.
  let json: Record<string, any> = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
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

/** Check, then answer the approval card. Returns the digest and (only on "approve") the host's token. */
async function approve(t: import("node:test").TestContext, app: express.Express, options: { themeId?: string; decision?: string; principal?: string } = {}) {
  const check = await call(t, app, { path: "/check", body: { themeId: options.themeId ?? GOOD } });
  const answer = await call(t, app, { path: "/restore/approval", principal: options.principal, body: { themeId: options.themeId ?? GOOD, ...check.json.approval, decision: options.decision ?? "approve" } });
  return { digest: check.json.digest as string, approval: check.json.approval, answer, token: answer.json.confirmationToken as string | undefined };
}

/** Restore body for a full approval: the digest is the version check, the token is the approval. */
async function approvedBody(t: import("node:test").TestContext, app: express.Express, themeId = GOOD) {
  const { digest, token } = await approve(t, app, { themeId });
  return { themeId, approvedDigest: digest, confirmationToken: token };
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
  assert.equal(tier.json.approval, null);
  assert.match(tier.json.problems.join(" "), /says it is a static theme, but it sits in the declarative folder/);

  const code = await call(t, app, { path: "/check", body: { themeId: "declarative/has-code" } });
  assert.equal(code.json.passes, false);
  assert.equal(code.json.digest, null);
  assert.match(code.json.problems.join(" "), /server\.ts/);

  const good = await call(t, app, { path: "/check", body: { themeId: GOOD } });
  assert.deepEqual({ ...good.json, digest: typeof good.json.digest, approval: Object.keys(good.json.approval ?? {}).sort() }, { themeId: GOOD, passes: true, problems: [], digest: "string", nameTaken: false, approval: ["planHash", "planId"] });

  assert.equal((await call(t, app, { path: "/check", body: { themeId: "../x" } })).json.code, "INVALID_ID");
  assert.equal((await call(t, app, { path: "/check", body: { themeId: "static/nope" } })).status, 404);
});

/** Live + held trees, so "refused and nothing moved" is two deepEquals. */
function snapshot(site: { held: string; themesDir: string }) {
  return { held: hashTree(site.held), live: hashTree(site.themesDir) };
}

function assertHeldIntact(site: { held: string; themesDir: string }, before: ReturnType<typeof snapshot>) {
  assert.deepEqual(snapshot(site), before);
  assert.ok(fs.existsSync(path.join(site.held, "themes", GOOD, "theme.json")));
  assert.equal(fs.existsSync(path.join(site.themesDir, GOOD)), false);
}

test("held-back restore refused with digest only after successful check", async (t) => {
  const site = buildApp();
  const check = await call(t, site.app, { path: "/check", body: { themeId: GOOD } });
  assert.equal(check.json.passes, true);
  const before = snapshot(site);
  // The digest is only a version check: on its own it is not the owner's approval.
  const refused = await call(t, site.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: check.json.digest } });
  assert.equal(refused.status, 400);
  assert.equal(refused.json.code, "APPROVAL_REQUIRED");
  assertHeldIntact(site, before);
  assert.equal(site.themes.some((theme) => theme.manifest.id === "minimal-declarative"), false);
});

test("held-back restore refused after the approval card is declined", async (t) => {
  const site = buildApp();
  const before = snapshot(site);
  const declined = await approve(t, site.app, { decision: "decline" });
  assert.equal(declined.answer.status, 200);
  assert.deepEqual(declined.answer.json, { approved: false });
  const refused = await call(t, site.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: declined.digest } });
  assert.equal(refused.status, 400);
  assert.equal(refused.json.code, "APPROVAL_REQUIRED");
  // A token the host never minted (here the plan id) is no approval either.
  const forged = await call(t, site.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: declined.digest, confirmationToken: declined.approval.planId } });
  assert.equal(forged.status, 409);
  assert.equal(forged.json.code, "TOKEN_EXPIRED");
  // Anything but an explicit "approve" mints nothing.
  const vague = await approve(t, site.app, { decision: "yes" });
  assert.deepEqual(vague.answer.json, { approved: false });
  assertHeldIntact(site, before);
});

test("held-back approval is bound to actor, theme and digest", async (t) => {
  const site = buildApp();
  const before = snapshot(site);
  const { digest, token } = await approve(t, site.app);
  assert.equal(typeof token, "string");
  const otherActor = await call(t, site.app, { path: "/restore", principal: "someone-else", body: { themeId: GOOD, approvedDigest: digest, confirmationToken: token } });
  assert.equal(otherActor.status, 403);
  assert.equal(otherActor.json.code, "ACTOR_CLASS_MISMATCH");
  const otherDigest = await call(t, site.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: "0".repeat(64), confirmationToken: token } });
  assert.equal(otherDigest.status, 409);
  assert.equal(otherDigest.json.code, "PLAN_STALE");
  const otherTheme = await call(t, site.app, { path: "/restore", body: { themeId: "declarative/bad-tier", approvedDigest: digest, confirmationToken: token } });
  assert.equal(otherTheme.status, 409);
  assert.equal(otherTheme.json.code, "PLAN_STALE");
  assertHeldIntact(site, before);
  // None of those refusals spent the approval: the approving owner can still use it.
  const ok = await call(t, site.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: digest, confirmationToken: token } });
  assert.equal(ok.status, 201);
});

test("held-back restore requires approval", async (t) => {
  const { app, held, themesDir } = buildApp();
  const missing = await call(t, app, { path: "/restore", body: { themeId: GOOD } });
  assert.equal(missing.status, 400);
  assert.equal(missing.json.code, "APPROVAL_REQUIRED");
  assert.ok(fs.existsSync(path.join(held, "themes", GOOD, "theme.json")));

  // Approved, then the files change: the digest (version check) refuses it.
  const changed = buildApp();
  const changedBody = await approvedBody(t, changed.app);
  fs.appendFileSync(path.join(changed.held, "themes", GOOD, "theme.json"), "\n");
  const wrong = await call(t, changed.app, { path: "/restore", body: changedBody });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.json.code, "CHANGED_SINCE_CHECK");
  assert.ok(fs.existsSync(path.join(changed.held, "themes", GOOD, "theme.json")));

  // Approved, then code is planted: the fresh re-check refuses it.
  const planted = buildApp();
  const plantedBody = await approvedBody(t, planted.app);
  fs.writeFileSync(path.join(planted.held, "themes", GOOD, "server.ts"), "export {};\n");
  const bad = await call(t, planted.app, { path: "/restore", body: plantedBody });
  assert.equal(bad.status, 409);
  assert.equal(bad.json.code, "CHECK_FAILED");
  assert.ok(bad.json.problems.length > 0);
  assert.ok(fs.existsSync(path.join(planted.held, "themes", GOOD, "theme.json")));
  assert.equal(fs.existsSync(path.join(planted.themesDir, GOOD)), false);
  assert.equal(fs.existsSync(path.join(themesDir, "declarative", "bad-tier")), false);

  const noEdit = buildApp({ allowed: (permission) => permission !== "theme.edit" });
  const digest = await approvedDigest(t, noEdit.app);
  const forbidden = await call(t, noEdit.app, { path: "/restore", body: { themeId: GOOD, approvedDigest: digest, confirmationToken: "ctok_x" } });
  assert.equal(forbidden.status, 403);
  const cannotApprove = await approve(t, noEdit.app);
  assert.equal(cannotApprove.answer.status, 403);
  assert.ok(fs.existsSync(path.join(noEdit.held, "themes", GOOD, "theme.json")));
});

test("held-back restore moves only that theme", async (t) => {
  const { app, held, themesDir, themes, presentation, siteDir } = buildApp();
  fs.writeFileSync(path.join(held, "held-back-choice.json"), JSON.stringify({ chosenThemeId: GOOD, fallbackThemeId: "live-one" }));
  const heldBefore = hashTree(held);
  const liveBefore = hashTree(themesDir);
  const body = await approvedBody(t, app);

  const { status, json } = await call(t, app, { path: "/restore", body });
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

  // The approval is single-use.
  const again = await call(t, app, { path: "/restore", body });
  assert.equal(again.status, 409);
  assert.equal(again.json.code, "TOKEN_ALREADY_REDEEMED");

  // A marker naming a different theme survives a restore.
  const other = buildApp();
  const marker = JSON.stringify({ chosenThemeId: "declarative/bad-tier", fallbackThemeId: "live-one" });
  fs.writeFileSync(path.join(other.held, "held-back-choice.json"), marker);
  await call(t, other.app, { path: "/restore", body: await approvedBody(t, other.app) });
  assert.equal(fs.readFileSync(path.join(other.held, "held-back-choice.json"), "utf8"), marker);

  // The live folder already existing is a 409 NAME_TAKEN and nothing moves.
  const taken = buildApp();
  copyTheme({ to: path.join(taken.themesDir, GOOD), id: "minimal-declarative" });
  const check = await call(t, taken.app, { path: "/check", body: { themeId: GOOD } });
  assert.equal(check.json.nameTaken, true);
  const refused = await call(t, taken.app, { path: "/restore", body: await approvedBody(t, taken.app) });
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

  await call(t, shown.app, { path: "/restore", body: await approvedBody(t, shown.app) });
  assert.equal((await call(t, shown.app)).json.chosenThemeHeldBack, null);
});
