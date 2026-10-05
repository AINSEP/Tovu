import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import Database from "better-sqlite3";

import { createToolRegistry, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";

import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
import { MCP_UI_REDEEMABLE_TOOL_IDS } from "#src/assistant/mcp-ui-tool-calls";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { resolveSkillLayout } from "#src/features/skills/layout";
import { collectSiteBackupFiles } from "#src/features/site-backup/sources";
import { FakeGitHub } from "#src/features/site-backup/__tests__/fixtures/fake-github";
import { githubFromSource } from "#src/features/source-control/__tests__/fixtures/github-from-source";
import { createCustomCredential } from "#src/features/custom-credentials/store";
import { LEGACY_SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
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

function call(registration: ToolRegistration, input: unknown): Promise<unknown> {
  const ctx: ToolExecutionContext = {
    executionId: "exec-wiring",
    principal: { id: "principal-wiring" },
    run: { id: "run-wiring" },
    input,
    signal: new AbortController().signal,
  };
  return Promise.resolve(registration.handler(ctx));
}

function callPlan(registration: ToolRegistration): Promise<unknown> {
  return call(registration, { owner: "octo", repo: "backups" });
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

/** Points `homedir()`-based site-key lookup at a throwaway folder and gives the composed keyring a
 *  fresh `TOVU_SITE_KEY`, so sealing a credential never reads or writes the operator's `~/.tovu`. */
function isolateSiteKey(t: TestContext, home: string): void {
  const saved = { HOME: process.env.HOME, [LEGACY_SITE_KEY_ENV_VAR_NAME]: process.env[LEGACY_SITE_KEY_ENV_VAR_NAME], TOVU_SITE_KEY: process.env.TOVU_SITE_KEY, TOVU_RUNTIME_MODE: process.env.TOVU_RUNTIME_MODE };
  process.env.HOME = home;
  delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
  delete process.env.TOVU_RUNTIME_MODE;
  process.env.TOVU_SITE_KEY = randomBytes(32).toString("hex");
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("the composed plan and push back up THIS site: a credential sealed by the composed sealer, the real database snapshot, and the site's own files land in one commit", async (t) => {
  // Only the git host is faked (and the plugin is read from source, not the developer's workspace).
  // The credential store, sealer, keyring, dbOps, sources and both handlers are the composition's own,
  // so a push handler wired to the wrong store, sealer or database fails here, not just in the unit suite.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-backup-push-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  isolateSiteKey(t, path.join(root, "home"));
  const siteDir = path.join(root, "demo-site");
  const themesDir = path.join(root, "themes");
  const uploadsDir = path.join(root, "uploads");
  fs.mkdirSync(path.join(themesDir, "static", "wired"), { recursive: true });
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, "config.json"), '{"name":"Wiring Site"}', "utf8");
  fs.writeFileSync(path.join(themesDir, "static", "wired", "theme.css"), "/* wired theme */", "utf8");

  const deps = await createSiteRouteDeps(path.join(siteDir, "content.db"), {
    uploadsDir,
    themesDir,
    siteBinding: { dir: siteDir, name: "demo-site", dirOverridden: true, switcherCompatible: false },
  });
  await deps.identityReady;

  await createCustomCredential(
    { repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: "github", category: "source-control", baseUrl: "https://api.github.com", additionalHosts: [], connection: { token: "ghp_wiring_test_token_never_real" } },
  );

  const github = new FakeGitHub();
  const tools = registrationsOver({ ...deps, customCredentialsHttpClient: github, loadSourceControlProviders: githubFromSource } as Parameters<typeof registrationsOver>[0]);
  const planTool = tools.get("site_backup_plan");
  const pushTool = tools.get("site_backup_push");
  assert.ok(planTool && pushTool);

  const planned = (await call(planTool, { owner: "octo", repo: "backups", include: { plugins: false } })) as { planned: boolean; planId: string; folder: string; files: { path: string }[] };
  assert.equal(planned.planned, true, `the composed plan must succeed: ${JSON.stringify(planned)}`);
  assert.equal(planned.folder, "demo-site");
  assert.ok(github.calls.every((c) => c.method === "GET"), "the plan writes nothing");

  const pushed = (await call(pushTool, { planId: planned.planId })) as { pushed: boolean; commitSha: string };
  assert.equal(pushed.pushed, true, `the composed push must succeed: ${JSON.stringify(pushed)}`);
  assert.equal(pushed.commitSha, "new-commit");
  assert.deepEqual(github.unexpected, []);
  const authorizations = github.calls.map((c) => Object.entries((c.headers ?? {}) as Record<string, string>).find(([name]) => name.toLowerCase() === "authorization")?.[1] ?? "");
  assert.ok(authorizations.every((value) => value.includes("ghp_wiring_test_token_never_real")), "every GitHub call carries the token the composed sealer opened");

  const committed = [...github.files.keys()].sort();
  assert.deepEqual(committed, ["README.md", "demo-site/database/content.db", "demo-site/settings/config.json", "demo-site/themes/static/wired/theme.css", "demo-site/tovu-backup.json"]);
  assert.equal(github.files.get("demo-site/settings/config.json")?.toString("utf8"), '{"name":"Wiring Site"}');
  assert.equal(github.files.get("demo-site/themes/static/wired/theme.css")?.toString("utf8"), "/* wired theme */");
  const manifest = JSON.parse(github.files.get("demo-site/tovu-backup.json")!.toString("utf8")) as { format: string; files: { path: string }[] };
  assert.equal(manifest.format, "tovu-site-backup");
  assert.deepEqual(manifest.files.map((f) => f.path).sort(), ["database/content.db", "settings/config.json", "themes/static/wired/theme.css"]);

  // The committed database is a real SQLite snapshot of THIS site's content.db: it holds the very
  // credential row the composed repo just wrote (sealed — the token itself is not in the bytes).
  const dbBytes = github.files.get("demo-site/database/content.db")!;
  assert.equal(dbBytes.subarray(0, 16).toString("latin1"), "SQLite format 3\0");
  assert.ok(!dbBytes.includes(Buffer.from("ghp_wiring_test_token_never_real")), "the snapshot holds the token sealed, never in clear");
  const copy = path.join(root, "pushed.db");
  fs.writeFileSync(copy, dbBytes);
  const snapshot = new Database(copy, { readonly: true });
  try {
    const labels = (snapshot.prepare("SELECT label FROM custom_credential_sets").all() as { label: string }[]).map((r) => r.label);
    assert.deepEqual(labels, ["github"]);
  } finally {
    snapshot.close();
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
