import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolRegistry, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";

import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
import { MCP_UI_REDEEMABLE_TOOL_IDS } from "#src/assistant/mcp-ui-tool-calls";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { resolveSkillLayout } from "#src/features/skills/layout";
import { collectSiteBackupFiles } from "#src/features/site-backup/sources";
import { describeSiteBinding } from "#src/platform/site-dir/site-registry";
import { createRouteDeps } from "../app.js";
import { createSiteRouteDeps, mediaUploadsDir } from "../deps.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/**
 * @file The site-backup tools reach a real runtime: the real SQLite composition root hands them
 * the SAME directories it serves the site from, the real first-party registry wires both tool ids,
 * the push is on the MCP-UI allowlist its Confirm button needs, and a BYOK turn can find the plan
 * tool by searching. `features/site-backup/__tests__/tool-registrations.unit.test.ts` proves what
 * the tools do; this file proves they are connected.
 */

type RegistryDeps = Parameters<typeof buildAssistantToolRegistrations>[0];

/** Builds the real first-party registrations over `routeDeps`, with every permission granted. */
function registrationsOver(routeDeps: Omit<RegistryDeps, "magicLinkPerEmailLimiter">): Map<string, ToolRegistration> {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const allowAll: RegistryDeps["authorize"] = async () => ({ allowed: true, reason: "test" });
  const registrations = buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter, authorize: allowAll } as RegistryDeps, undefined, { contributions });
  return new Map(registrations.map((r) => [r.descriptor.id, r]));
}

function callPlan(registration: ToolRegistration): Promise<unknown> {
  const ctx: ToolExecutionContext = {
    executionId: "exec-wiring",
    principal: { id: "principal-wiring" },
    run: { id: "run-wiring" },
    input: { owner: "octo", repo: "backups" },
    signal: new AbortController().signal,
  };
  return Promise.resolve(registration.handler(ctx));
}

test("createSiteRouteDeps gives site backup the directories the site is served from, and the real registry wires both tools to them", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-backup-wiring-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"));
  await deps.identityReady;

  const sources = deps.siteBackupSources;
  assert.ok(sources, "the real runtime must carry siteBackupSources, or both tools answer UNAVAILABLE");
  assert.equal(sources.siteDir, deps.siteBinding.dir);
  assert.equal(sources.themesDir, deps.themesDir);
  assert.equal(sources.mediaUploadsDir, process.env.TOVU_MEDIA_BLOB_STORE === "s3" ? null : mediaUploadsDir());
  assert.equal(sources.agentPluginsDir, resolveAgentPluginLayout().root);
  assert.equal(sources.skillsDir, resolveSkillLayout().root);
  const productVersion = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string }).version;
  assert.equal(sources.tovuVersion, productVersion);

  const tools = registrationsOver(deps);
  const plan = tools.get("site_backup_plan");
  assert.ok(plan, "site_backup_plan must be in the real registry");
  assert.ok(tools.get("site_backup_push"), "site_backup_push must be in the real registry");

  // A fresh database has no saved credential. Reaching that check (instead of UNAVAILABLE) proves the
  // handler got this runtime's sources and its real credential store.
  const result = (await callPlan(plan)) as { planned: boolean; code: string };
  assert.equal(result.planned, false);
  assert.equal(result.code, "CREDENTIAL_NOT_FOUND");
});

test("caller-supplied site, uploads and themes directories are the exact folders the backup collects from, not the defaults", async (t) => {
  // Three distinct override folders, each holding a file no default folder has. Comparing sources
  // against the DEFAULT directories (the test above) cannot tell a composition that ignores an
  // override from one that honors it when both happen to be the default.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-backup-overrides-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const siteDir = path.join(root, "site-override");
  const uploadsDir = path.join(root, "uploads-override");
  const themesDir = path.join(root, "themes-override");
  fs.mkdirSync(siteDir, { recursive: true });
  fs.mkdirSync(path.join(uploadsDir, "originals"), { recursive: true });
  fs.mkdirSync(path.join(themesDir, "static", "override-only"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, "config.json"), '{"marker":"site-override"}', "utf8");
  fs.writeFileSync(path.join(uploadsDir, "originals", "override-only.bin"), "uploads-override-bytes", "utf8");
  fs.writeFileSync(path.join(themesDir, "static", "override-only", "marker.css"), "/* themes-override */", "utf8");

  const deps = await createSiteRouteDeps(path.join(root, "content.db"), {
    uploadsDir,
    themesDir,
    siteBinding: { dir: siteDir, name: "site-override", dirOverridden: true, switcherCompatible: false },
  });
  await deps.identityReady;

  const sources = deps.siteBackupSources;
  assert.ok(sources);
  assert.equal(sources.siteDir, siteDir);
  assert.equal(sources.themesDir, themesDir);
  assert.equal(sources.mediaUploadsDir, process.env.TOVU_MEDIA_BLOB_STORE === "s3" ? null : uploadsDir);
  assert.notEqual(siteDir, describeSiteBinding().dir, "precondition: the override differs from the default site folder");

  const collected = await collectSiteBackupFiles({ sources, include: { database: false, media: true, themes: true, plugins: false, settings: true } });
  const byPath = new Map(collected.files.map((file) => [file.path, file]));
  assert.equal(byPath.get("settings/config.json")?.absPath, path.join(siteDir, "config.json"));
  assert.equal(byPath.get("themes/static/override-only/marker.css")?.absPath, path.join(themesDir, "static", "override-only", "marker.css"));
  if (process.env.TOVU_MEDIA_BLOB_STORE !== "s3") {
    assert.equal(byPath.get("uploads/originals/override-only.bin")?.absPath, path.join(uploadsDir, "originals", "override-only.bin"));
  }
  // Every collected settings/themes/media file comes from the override folders and nowhere else.
  for (const file of collected.files) {
    assert.ok([siteDir, themesDir, uploadsDir].some((dir) => file.absPath.startsWith(dir + path.sep)), `${file.path} was collected from ${file.absPath}, outside the override folders`);
  }
});

test("the in-memory runtime registers both tools, and they answer UNAVAILABLE rather than backing up nothing", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  assert.equal(deps.siteBackupSources, undefined);

  const plan = registrationsOver(deps).get("site_backup_plan");
  assert.ok(plan);
  const result = (await callPlan(plan)) as { planned: boolean; code: string };
  assert.equal(result.code, "UNAVAILABLE");
});

// 6eac86229 ("confirm destructive and protected actions only") retired site_backup_push's Back up/
// Cancel card: the push now runs immediately after authorization, so it parks on no exchange and an
// allowlist entry would only let surface HTML redeem a tool that has no dialog.
test("neither site-backup tool is on the MCP-UI allowlist, since neither raises a dialog to redeem", () => {
  assert.ok(!MCP_UI_REDEEMABLE_TOOL_IDS.has("site_backup_push"), "the push raises no dialog since 6eac86229 and has nothing to redeem");
  assert.ok(!MCP_UI_REDEEMABLE_TOOL_IDS.has("site_backup_plan"), "the plan raises no dialog and has nothing to redeem");
});

test("a BYOK turn finds site_backup_plan in the top 3 for how an owner asks for a backup", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = createToolRegistry({});
  for (const registration of registrationsOver(deps).values()) registry.register(registration);
  const catalog = buildToolCatalogQuery(registry);

  for (const query of ["back up my site to github", "save a copy of my site and database to a private repo"]) {
    const hits = catalog.search({ query }, { limit: 10 }).map((hit) => hit.id);
    const rank = hits.indexOf("site_backup_plan") + 1;
    assert.ok(rank >= 1 && rank <= 3, `"${query}" must rank site_backup_plan in the top 3; got ${rank === 0 ? "a miss" : rank}: ${hits.slice(0, 5).join(", ")}`);
  }
});
