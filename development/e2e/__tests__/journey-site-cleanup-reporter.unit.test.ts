import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { FullConfig } from "@playwright/test";
import journeysGlobalSetup from "../journeys/journeys.globalSetup.js";
import JourneySiteCleanupReporter from "../support/journey-site-cleanup-reporter.js";
import type { IsolatedJourneySite } from "../support/isolated-journey-site.js";

test("after server teardown, the reporter deletes and proves deletion of its isolated SQLite site", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "tovu-journeys-cleanup-test-"));
  t.after(() => rm(runtimeDir, { recursive: true, force: true }));
  const siteDir = path.join(runtimeDir, "sites", "journey-site");
  await mkdir(siteDir, { recursive: true });
  await writeFile(path.join(siteDir, "content.db"), "fixture database");
  await writeFile(path.join(runtimeDir, "storage-state.json"), "fixture session");
  const site = { ownerPid: process.pid, runtimeDir, siteDir } as IsolatedJourneySite;
  assert.equal(await new JourneySiteCleanupReporter({ site }).onEnd(), undefined);
  await assert.rejects(access(siteDir), { code: "ENOENT" });
  await assert.rejects(access(runtimeDir), { code: "ENOENT" });
});

test("media alone selects SQLite, logs in to its own site, and both sites and database files are deleted", async (t) => {
  const envKeys = ["TOVU_E2E_ISOLATED_JOURNEYS", "TOVU_E2E_ISOLATED_JOURNEYS_MEDIA", "TOVU_E2E_PACKAGED_APP", "TOVU_DB"];
  const priorEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  process.env.TOVU_DB = "memory";
  let sites: IsolatedJourneySite[] = [];
  t.after(async () => {
    for (const site of sites) await rm(site.runtimeDir, { recursive: true, force: true });
    for (const [key, value] of priorEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  // Importing configuration creates descriptors only: no Playwright run or application boot.
  const config = await (await import("../../playwright.journeys.config.js")).default;
  const standard = config.metadata!.isolatedJourneySite as IsolatedJourneySite;
  const [defaultProject, mediaProject] = config.projects!;
  const media = mediaProject.metadata!.isolatedJourneySite as IsolatedJourneySite;
  sites = [standard, media];
  assert.equal(standard.database, process.env.TOVU_E2E_ASSISTANT_AGENT === "codex-cli" ? "sqlite" : "memory");
  assert.equal(media.database, "sqlite");
  assert.equal(media.runtime, "default");
  assert.equal(process.env.TOVU_DB, "memory", "The owner environment and other journeys are not flipped");
  assert.notEqual(media.runtimeDir, standard.runtimeDir);
  assert.notEqual(media.storageState, standard.storageState);
  assert.equal(new Set(sites.flatMap((site) => Object.values(site.ports))).size, 6);
  const matches = (pattern: string | RegExp | Array<string | RegExp> | undefined, file: string) => {
    assert.ok(pattern instanceof RegExp);
    return pattern.test(file);
  };
  const mediaFile = "/journeys/media.journey.ts";
  assert.ok(matches(defaultProject.testIgnore, mediaFile));
  assert.ok(matches(mediaProject.testMatch, mediaFile));
  assert.ok(matches(config.testMatch, "/journeys/posts.journey.ts"));
  assert.equal(matches(defaultProject.testIgnore, "/journeys/posts.journey.ts"), false);
  assert.equal(matches(mediaProject.testMatch, "/journeys/posts.journey.ts"), false);
  assert.equal(mediaProject.use!.baseURL, media.adminURL);
  assert.equal(mediaProject.use!.storageState, media.storageState);
  assert.equal(mediaProject.snapshotPathTemplate, "{testDir}/{testFilePath}-snapshots/{arg}-chromium-{platform}{ext}");
  for (const site of sites) {
    const boot = JSON.parse(await readFile(site.manifestPath, "utf8"));
    assert.equal(boot.env.TOVU_DB, site.database);
    assert.equal(boot.env.TOVU_CONTENT_DB, path.join(site.siteDir, "content.db"));
    assert.equal(boot.env.TOVU_CHAT_DB, path.join(site.siteDir, "chat.db"));
    assert.equal(boot.env.TOVU_MEDIA_UPLOADS_DIR, path.join(site.siteDir, "uploads"));
    assert.ok((config.webServer as Array<{ command: string }>).some(({ command }) => command.includes(site.manifestPath)));
  }

  const fullConfig = {
    metadata: { ...config.metadata },
    projects: config.projects!.map((project) => ({ ...project, metadata: { ...project.metadata }, use: { ...config.use, ...project.use } })),
  } as unknown as FullConfig;
  // Keep this unit test independent of installed Local CLIs, even under the Codex opt-in.
  const setupSites = sites.map((site) => ({ ...site, runtime: "default" as const }));
  fullConfig.metadata.isolatedJourneySite = setupSites[0];
  fullConfig.projects[1].metadata.isolatedJourneySite = setupSites[1];
  // A second project sharing the default site must reuse the single login.
  fullConfig.projects.push(fullConfig.projects[0]);
  const logins: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    logins.push(url);
    assert.equal(init.redirect, "error");
    assert.deepEqual(JSON.parse(init.body as string), { username: "admin", password: "tovu-journeys" });
    return new Response("{}", { status: 200, headers: { "set-cookie": `session=${logins.length}; Path=/; HttpOnly` } });
  });
  await journeysGlobalSetup(fullConfig);
  assert.deepEqual(logins, sites.map((site) => `${site.adminURL}/api/admin/v1/auth/login`));
  for (const [index, site] of sites.entries()) {
    const state = JSON.parse(await readFile(site.storageState, "utf8"));
    assert.equal(state.cookies[0].value, String(index + 1));
    assert.equal(state.cookies[0].domain, "127.0.0.1");
  }
  fullConfig.projects[1].use.baseURL = standard.adminURL;
  await assert.rejects(journeysGlobalSetup(fullConfig), /requires the isolated site created by its config/);
  assert.equal(logins.length, 2, "Validate every project's provenance before submitting credentials");

  const databaseFiles = ["content.db", "content.db-wal", "content.db-shm", "chat.db", "chat.db-wal", "chat.db-shm"]
    .map((file) => path.join(media.siteDir, file));
  for (const file of databaseFiles) await writeFile(file, "fixture database");
  const cleanup = (config.reporter as Array<[string, { sites?: IsolatedJourneySite[] }]>).find(([name]) => name.endsWith("journey-site-cleanup-reporter.ts"));
  assert.ok(cleanup);
  assert.deepEqual(cleanup[1].sites, sites);
  assert.equal(await new JourneySiteCleanupReporter(cleanup[1] as { sites: IsolatedJourneySite[] }).onEnd(), undefined);
  for (const site of sites) {
    await assert.rejects(access(site.runtimeDir), { code: "ENOENT" });
    await assert.rejects(access(site.siteDir), { code: "ENOENT" });
  }
  for (const file of databaseFiles) await assert.rejects(access(file), { code: "ENOENT" });
});

test("a cleanup ownership failure still deletes the other isolated site and fails the run", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "tovu-journeys-cleanup-test-"));
  t.after(() => rm(runtimeDir, { recursive: true, force: true }));
  const siteDir = path.join(runtimeDir, "sites", "journey-site");
  await mkdir(siteDir, { recursive: true });
  const site = { ownerPid: process.pid, runtimeDir, siteDir } as IsolatedJourneySite;
  t.mock.method(console, "error", () => undefined);
  const result = await new JourneySiteCleanupReporter({ sites: [{ ...site, ownerPid: -1 }, site] }).onEnd();
  assert.deepEqual(result, { status: "failed" });
  await assert.rejects(access(runtimeDir), { code: "ENOENT" });
});

test("the reporter deletes read-only installed package directories inside the site", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "tovu-journeys-cleanup-test-"));
  const siteDir = path.join(runtimeDir, "sites", "journey-site");
  const packageDir = path.join(siteDir, "agent-plugins", "package", "sha256", "abc");
  t.after(async () => {
    await chmod(packageDir, 0o755).catch(() => undefined);
    await rm(runtimeDir, { recursive: true, force: true });
  });
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, "mcp.json"), "{}");
  await chmod(path.join(packageDir, "mcp.json"), 0o444);
  await chmod(packageDir, 0o555);
  const site = { ownerPid: process.pid, runtimeDir, siteDir } as IsolatedJourneySite;
  assert.equal(await new JourneySiteCleanupReporter({ site }).onEnd(), undefined);
  await assert.rejects(access(runtimeDir), { code: "ENOENT" });
});
