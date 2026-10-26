import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../../custom-credentials/store.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { SiteBackupPlanStore, type SiteBackupPlan } from "../plan-store.js";
import { fileIdentity, type PlannedDiskFile, type SiteBackupSources } from "../sources.js";
import { initialPushProgress, uploadPlannedContent, CANCELLED, type PushFailure } from "../push-engine.js";
import { buildSourceControlProviderForApi } from "../../source-control/provider-registry.js";
import { SiteBackupPushJobs } from "../push-jobs.js";
import { buildSiteBackupRegistrations, contributeSiteBackupTools, siteBackupAgentToolCatalog, siteBackupDerivedRisk, type PushResult, type SiteBackupToolDeps } from "../tool-registrations.js";
import type { SourceControlProviderDescriptor } from "../../source-control/provider-registry.js";
import type { SourceControlProviderOperations } from "../../source-control/provider-module.js";
import { githubFromSource } from "../../source-control/__tests__/fixtures/github-from-source.js";
import { InMemorySourceControlCredentialSetRepo } from "../../source-control/repo.memory.js";
import { createSourceControlCredential } from "../../source-control/store.js";
import { FakeGitHub } from "./fixtures/fake-github.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file `site_backup_plan` / `site_backup_push`'s proof, driven through the real registrations: a
 * real `SurfaceExchangeStore` answered with `surfaceExchanges.deliver(...)` (the human's click), real
 * sealed credentials, a real `SiteBackupPlanStore`, a throwaway site folder on disk, and a fake GitHub
 * that records every request. Nothing here reaches GitHub.
 *
 * The properties this file owns:
 * - the plan is read-only (GETs only, no dialog) and a refusal costs no database snapshot;
 * - the push needs no dialog (a repository write is not gated since 6eac86229), and re-checks what
 *   can change since the plan (visibility, the branch tip, the files) before the first blob is
 *   uploaded;
 * - a large push uploads a few files at a time, retries a transient host failure, names the file a
 *   final failure stopped at, and outlasts one call: past its wait budget it reports progress, and a
 *   re-call with the same planId waits on the same upload;
 * - a planId works once, for the principal that made it;
 * - a missing credential and an undecryptable one are different codes, and the decrypt error's own
 *   text never reaches the model;
 * - both tools need `site-backup.push` AND `custom-credentials.write`.
 */

const WORKSPACE_ID = "ws-site-backup";
const OWNER_PRINCIPAL = "principal-owner";
const OTHER_PRINCIPAL = "principal-other";
const NOW = "2026-09-21T12:00:00.000Z";
const TOKEN = ("g" + "hp_site_backup_test_token_never_real");
const PLAN_INPUT = { owner: "octo", repo: "backups" };
const DB_BYTES = [0x53, 0x51, 0x4c, 0x00, 0xff, 0x01];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Captures a fixed SQLite-looking snapshot into the given folder, exactly as `sources.unit.test.ts`'s
 *  own double does. */
class FakeDbOps implements DbOpsPort {
  readonly captureCalls: { scopeId: string }[] = [];
  constructor(private readonly dir: string) {}
  async getCapabilities(): Promise<{ restorePoint: RestoreCapability }> {
    return { restorePoint: { costClass: "cheap", kind: "file-snapshot" } };
  }
  async captureRestorePoint(required: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }> {
    this.captureCalls.push(required);
    const artifactRef = path.join(this.dir, `restore-point-${required.scopeId}-${this.captureCalls.length}.db`);
    writeFileSync(artifactRef, Buffer.from(DB_BYTES));
    return { artifactRef, watermarkAtCapture: 42 };
  }
  async restoreFromArtifact(): Promise<{ restartRequired: boolean }> {
    throw new Error("a backup must never restore");
  }
}

/** Wraps a real sealer and makes `open` fail with text a leak check can look for. */
class LeakySealer implements SecretSealerPort {
  constructor(private readonly inner: SecretSealerPort) {}
  seal(input: Parameters<SecretSealerPort["seal"]>[0]): ReturnType<SecretSealerPort["seal"]> {
    return this.inner.seal(input);
  }
  async open(): Promise<string> {
    throw new Error(`LEAK-SENTINEL decrypted fragment {"token":"${TOKEN}"}`);
  }
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Redirects `homedir()`-based site-key resolution (`unreadableCredentialMessage`'s default,
 *  site-aware status) to a throwaway temp dir for the life of one test, and also clears the
 *  env-var/mode inputs that ordering reads — so a passing run never touches, creates, or is
 *  influenced by the operator's real `~/.tovu`. Mirrors `admin-site-key-routes.test.ts`'s own
 *  `isolateHomeDir`. */
function isolateHomeDir(t: TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-site-backup-test-home-"));
  const saved = {
    HOME: process.env.HOME,
    TOVU_SITE_KEY: process.env.TOVU_SITE_KEY,
    TOVU_RUNTIME_MODE: process.env.TOVU_RUNTIME_MODE,
  };
  process.env.HOME = dir;
  delete process.env.TOVU_SITE_KEY;
  delete process.env.TOVU_RUNTIME_MODE;
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** A throwaway site folder named `demo-site` (the default backup folder), with one file per scope. */
function makeSite(t: TestContext): { parent: string; root: string; sources: SiteBackupSources } {
  const parent = mkdtempSync(path.join(tmpdir(), "site-backup-tools-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "demo-site");
  write(path.join(root, "config.json"), JSON.stringify({ name: "Demo Site" }));
  write(path.join(root, ".site-meta.json"), JSON.stringify({ siteId: "s1" }));
  write(path.join(root, "uploads", "ws", "workspace-local", "blobs", "ab", "abcdef"), "IMG");
  write(path.join(root, "themes", "static", "demo", "index.html"), "<html>");
  write(path.join(root, "skills", "ws", "workspace-local", "notes", "SKILL.md"), "# skill");
  return {
    parent,
    root,
    sources: {
      siteDir: root,
      mediaUploadsDir: path.join(root, "uploads"),
      themesDir: path.join(root, "themes"),
      agentPlugins: resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "agent-plugins") } }),
      skillsDir: path.join(root, "skills"),
      tovuVersion: "0.1.0",
    },
  };
}

interface HarnessOptions {
  /** Which permissions `authorize` grants; everything by default. */
  allow?: (permission: string) => boolean;
  /** The sealer the tools decrypt with; the one credentials were sealed with by default. */
  openSealer?: (sealedWith: SecretSealerPort) => SecretSealerPort;
  siteKeyStatus?: () => { active: boolean; invalid?: boolean };
  /** When true, leaves `deps.siteBackupSiteKeyStatus` unset entirely (rather than this harness's own
   *  `{active: true}` stub) so the SUT's real default, site-aware status computation runs. */
  useDefaultSiteKeyStatus?: boolean;
  withoutSources?: boolean;
  planNowMs?: () => number;
  /** `deps.siteBackupPushWaitMs`; the real 4 minutes by default. */
  pushWaitMs?: number;
  /** Wraps the GitHub provider loader (to lower a host's file limit). */
  providers?: SiteBackupToolDeps["loadSourceControlProviders"];
}

function harness(t: TestContext, options: HarnessOptions = {}) {
  const site = makeSite(t);
  const repo = new InMemoryCustomCredentialSetRepo();
  const sourceControlRepo = new InMemorySourceControlCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const github = new FakeGitHub();
  const dbOps = new FakeDbOps(site.parent);
  let allow = options.allow ?? (() => true);
  const authorized: string[] = [];
  const logLines: string[] = [];
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const planStore = new SiteBackupPlanStore(options.planNowMs ? { now: options.planNowMs } : {});
  /** Every retry wait the GitHub client asked for; none is slept. */
  const sleeps: number[] = [];

  const deps: SiteBackupToolDeps = {
    authorize: async (params) => {
      authorized.push(`${params.principalId}:${params.permission}`);
      return allow(params.permission) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    workspaceId: WORKSPACE_ID,
    customCredentialSetRepo: repo,
    sourceControlCredentialSetRepo: sourceControlRepo,
    siteAssistantSecretSealer: options.openSealer ? options.openSealer(sealer) : sealer,
    customCredentialsHttpClient: github,
    loadSourceControlProviders: options.providers ?? githubFromSource,
    dbOps,
    ...(options.withoutSources ? {} : { siteBackupSources: site.sources }),
    siteBackupPlanStore: planStore,
    ...(options.useDefaultSiteKeyStatus ? {} : { siteBackupSiteKeyStatus: options.siteKeyStatus ?? (() => ({ active: true })) }),
    siteBackupFailureLog: (line) => logLines.push(line),
    siteBackupNow: () => new Date(NOW),
    siteBackupPushJobs: new SiteBackupPushJobs<PushResult>(),
    siteBackupSleep: async (ms) => void sleeps.push(ms),
    ...(options.pushWaitMs !== undefined ? { siteBackupPushWaitMs: options.pushWaitMs } : {}),
  };
  const writeDeps: CustomCredentialWriteDeps = {
    repo,
    sealer,
    keyring,
    clock: createFakeClock({ startIso: NOW }),
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
  };
  const tools = new Map(buildSiteBackupRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
  const planTool = tools.get("site_backup_plan");
  const pushTool = tools.get("site_backup_push");
  assert.ok(planTool && pushTool, "both site-backup tools must be registered");

  return {
    deps,
    repo,
    sourceControlRepo,
    site,
    github,
    dbOps,
    sleeps,
    authorized,
    logLines,
    surfaceExchanges,
    tools,
    planTool,
    pushTool,
    setAllow: (next: (permission: string) => boolean) => {
      allow = next;
    },
    seed: (label = "github", baseUrl = "https://api.github.com") =>
      createCustomCredential(writeDeps, { workspaceId: WORKSPACE_ID, label, category: "source-control", baseUrl, additionalHosts: [], connection: { token: TOKEN } }),
    /** Saves a GitHub connection the way chat's "Connect GitHub" form does (`source_control_propose_credential`). */
    seedConnection: (label = "GitHub backup") =>
      createSourceControlCredential(
        { deps: { ...writeDeps, repo: sourceControlRepo, loadSourceControlProviders: githubFromSource, fetchFn: (async () => new Response("{}", { status: 401 })) as typeof fetch }, input: { workspaceId: WORKSPACE_ID, label, connection: { providerId: "github", token: TOKEN } } }
      ),
  };
}

interface CallOptions {
  principalId?: string;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(tool: ToolRegistration, input: unknown, options: CallOptions = {}): Promise<unknown> {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: options.principalId ?? OWNER_PRINCIPAL },
    run: { id: "run-1" },
    input,
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return Promise.resolve(tool.handler(ctx));
}

type Result = Record<string, unknown>;

async function plan(h: ReturnType<typeof harness>, input: unknown = PLAN_INPUT): Promise<Result> {
  const emitted: unknown[] = [];
  const result = (await call(h.planTool, input, { emitSurface: async (s) => void emitted.push(s) })) as Result;
  assert.equal(emitted.length, 0, "the plan must never raise a dialog");
  return result;
}

function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  return match[1]!;
}
async function beginCall(h: ReturnType<typeof harness>, planId: string, principalId = OWNER_PRINCIPAL, signal?: AbortSignal) {
  return {pending: call(h.pushTool, {planId}, {principalId, signal}) as Promise<Result>};
}

function answer(h: ReturnType<typeof harness>, exchangeId: string, decision: "confirm" | "cancel", principalId = OWNER_PRINCIPAL): void {
  h.surfaceExchanges.deliver({ exchangeId, principalId, params: { decision } }, { toolId: "site_backup_push" });
}

async function plannedId(h: ReturnType<typeof harness>): Promise<string> {
  const result = await plan(h);
  assert.equal(result.planned, true, `the plan should succeed: ${JSON.stringify(result)}`);
  return result.planId as string;
}

/** Awaits a call that must be refused. Bounded, so a regression that parks on a dialog instead of
 *  refusing fails in 2 s rather than after the exchange's 5-minute idle deadline. */
async function rejection(promise: Promise<unknown>): Promise<ToolInputError> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("expected the call to be rejected, but it is still pending")), 2000);
  });
  try {
    const err = await Promise.race([
      promise.then(
        () => assert.fail("expected the call to be rejected"),
        (e: unknown) => e
      ),
      timeout,
    ]);
    assert.ok(err instanceof ToolInputError, `expected a ToolInputError, got ${String(err)}`);
    return err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test("both tools are registered; the plan is read-only and the push is not", (t) => {
  const h = harness(t);
  assert.deepEqual([...h.tools.keys()].sort(), ["site_backup_plan", "site_backup_push", "site_import_backup", "site_import_list", "site_share_create", "site_share_list", "site_share_revoke"]);
  assert.equal(h.planTool.descriptor.readOnly, true);
  assert.equal(h.pushTool.descriptor.readOnly, false);
});

test("share tools use the site-bound backend and authorize before every effect", async (t) => {
  const h = harness(t);
  const calls: string[] = [];
  const row = { shareId: "export-id", site: WORKSPACE_ID, file: "site.tovu.zip", bytes: 12, sha256: "a".repeat(64), url: null, status: "active" as const, createdAt: NOW, revokedAt: null, downloadUrl: "/private/download" };
  const registrations = buildSiteBackupRegistrations({ ...h.deps, siteShareBackend: {
    registry: {} as import("../share-registry.js").SiteShareRegistry,
    create: async ({ principalId }) => { calls.push(`create:${principalId}`); return row; },
    list: async () => { calls.push("list"); return [row]; },
    revoke: async ({ shareId }) => { calls.push(`revoke:${shareId}`); return { ...row, status: "revoked" as const }; },
  } }, { surfaceExchanges: h.surfaceExchanges });
  const tools = new Map(registrations.map(r => [r.descriptor.id, r]));
  assert.deepEqual(await call(tools.get("site_share_create")!, {}), row);
  assert.deepEqual(await call(tools.get("site_share_list")!, {}), { shares: [row] });
  assert.equal((await call(tools.get("site_share_revoke")!, { shareId: row.shareId }) as Result).status, "revoked");
  const before = [...calls];
  h.setAllow(() => false);
  for (const [id, input] of [["site_share_create", {}], ["site_share_list", {}], ["site_share_revoke", { shareId: row.shareId }]] as const) await assert.rejects(call(tools.get(id)!, input));
  assert.deepEqual(calls, before, "permission denials never reach the export or registry ports");
});

// ---------------------------------------------------------------------------
// site_backup_plan
// ---------------------------------------------------------------------------

test("the plan is read-only: GETs only, no dialog, and it returns a planId with every file it would write", async (t) => {
  const h = harness(t);
  await h.seed();

  const result = await plan(h);

  assert.equal(result.planned, true);
  assert.equal(typeof result.planId, "string");
  assert.equal(result.repository, "octo/backups");
  assert.equal(result.visibility, "private");
  assert.equal(result.credential, "github");
  assert.equal(result.branch, "main", "defaults to the repository's default branch");
  assert.equal(result.folder, "demo-site", "defaults to the site's folder name");
  assert.equal(result.folderExists, false);
  const files = result.files as { path: string; bytes: number }[];
  assert.equal(files[0]!.path, "database/content.db", "the database snapshot is listed first");
  assert.equal(files[0]!.bytes, DB_BYTES.length);
  assert.deepEqual(files.slice(1).map((f) => f.path).sort(), [
    "settings/.site-meta.json",
    "settings/config.json",
    "skills/ws/workspace-local/notes/SKILL.md",
    "themes/static/demo/index.html",
    "uploads/ws/workspace-local/blobs/ab/abcdef",
  ]);
  assert.equal(result.fileCount, files.length);
  assert.equal(result.totalBytes, files.reduce((sum, f) => sum + f.bytes, 0));

  assert.ok(h.github.calls.length > 0);
  assert.ok(h.github.calls.every((c) => c.method === "GET"), "the plan writes nothing to GitHub");
  assert.deepEqual(h.github.unexpected, []);
  assert.equal(h.surfaceExchanges.size(), 0);
  assert.deepEqual(h.dbOps.captureCalls, [{ scopeId: "site-backup" }]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN), "the token never appears in a result");
});

test("include.database=false takes no snapshot and lists no database file; media=false leaves uploads out", async (t) => {
  const h = harness(t);
  await h.seed();

  const result = await plan(h, { ...PLAN_INPUT, include: { database: false, media: false } });

  assert.equal(result.planned, true);
  const paths = (result.files as { path: string }[]).map((f) => f.path);
  assert.ok(!paths.includes("database/content.db"));
  assert.ok(!paths.some((p) => p.startsWith("uploads/")));
  assert.equal(h.dbOps.captureCalls.length, 0);
});

test("a plan whose media lives in object storage carries that scope's note and lists no uploads", async (t) => {
  const h = harness(t);
  await h.seed();
  const tool = overriddenTool(h, "site_backup_plan", { siteBackupSources: { ...h.site.sources, mediaUploadsDir: null } });
  const result = (await call(tool, PLAN_INPUT)) as Result;
  assert.deepEqual({ notes: result.notes, uploads: (result.files as { path: string }[]).filter((f) => f.path.startsWith("uploads/")) }, {
    notes: ["Media is stored in object storage (TOVU_MEDIA_BLOB_STORE=s3 or the site's media storage setting), not in a folder on this server, so media files are not in this backup. The database still lists every media item."],
    uploads: [],
  });
});

test("a PUBLIC repository is refused at plan time, before any database snapshot", async (t) => {
  const h = harness(t);
  await h.seed();
  h.github.state.visibility = "public";

  const result = await plan(h);

  assert.equal(result.planned, false);
  assert.equal(result.code, "REPOSITORY_NOT_PRIVATE");
  assert.match(result.message as string, /public/);
  assert.equal(h.dbOps.captureCalls.length, 0, "a refused plan costs no snapshot");
  assert.equal(h.github.calls.length, 1, "refused on the repository lookup itself");
});

test("'include' refuses an unknown switch and refuses switching everything off — before any permission check or network call", async (t) => {
  const h = harness(t);
  await h.seed();

  const unknown = await rejection(call(h.planTool, { ...PLAN_INPUT, include: { database: true, chat: true } }));
  assert.match(unknown.message, /^SITE_BACKUP_INVALID_INPUT: /);
  assert.match(unknown.message, /chat/);

  const allOff = await rejection(call(h.planTool, { ...PLAN_INPUT, include: { database: false, media: false, themes: false, plugins: false, settings: false } }));
  assert.match(allOff.message, /^SITE_BACKUP_INVALID_INPUT: .*nothing to back up/);

  const notBoolean = await rejection(call(h.planTool, { ...PLAN_INPUT, include: { media: "no" } }));
  assert.match(notBoolean.message, /include\.media/);

  assert.deepEqual(h.authorized, []);
  assert.equal(h.github.calls.length, 0);
});

test("a folder inside '.github' is refused (GitHub reads workflows there)", async (t) => {
  const h = harness(t);
  await h.seed();
  const err = await rejection(call(h.planTool, { ...PLAN_INPUT, folder: ".github/workflows" }));
  assert.match(err.message, /^SITE_BACKUP_INVALID_INPUT: .*\.github/);
  assert.equal(h.github.calls.length, 0);
});

// 2026-09-29: '.github' is no longer a core rule; the github plugin declares it in
// tovu-source-control.json (reservedPaths), checked once the credential names the host.
test("the github plugin's reserved '.github' folder is refused case-insensitively, naming the reserved folder, before any GitHub call", async (t) => {
  const h = harness(t);
  await h.seed();
  const err = await rejection(call(h.planTool, { ...PLAN_INPUT, folder: ".GitHub" }));
  assert.match(err.message, /^SITE_BACKUP_INVALID_INPUT: the backup folder must not be inside '\.github': '\.GitHub'$/);
  assert.equal(h.github.calls.length, 0);
});

// 2026-09-29: owner/repo rules are the host's (the github plugin's validateTarget), checked once the
// credential names the host; the GitHub text is unchanged.
test("an owner or repo GitHub refuses keeps GitHub's own text, before any GitHub call", async (t) => {
  const h = harness(t);
  await h.seed();
  const owner = await rejection(call(h.planTool, { ...PLAN_INPUT, owner: "-bad" }));
  assert.equal(owner.message, "SITE_BACKUP_INVALID_INPUT: invalid GitHub owner '-bad'");
  const repo = await rejection(call(h.planTool, { ...PLAN_INPUT, repo: ".." }));
  assert.equal(repo.message, "SITE_BACKUP_INVALID_INPUT: invalid GitHub repo '..'");
  assert.equal(h.github.calls.length, 0);
});

test("a runtime without a site folder answers UNAVAILABLE", async (t) => {
  const h = harness(t, { withoutSources: true });
  await h.seed();
  const result = await plan(h);
  assert.deepEqual(result, { planned: false, code: "UNAVAILABLE", message: "site backup is not available in this runtime: it has no site folder on disk" });
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

test("both tools need site-backup.push AND custom-credentials.write; a refusal touches nothing", async (t) => {
  for (const denied of ["site-backup.push", "custom-credentials.write"]) {
    const h = harness(t, { allow: (permission) => permission !== denied });
    await h.seed();

    const planErr = await rejection(call(h.planTool, PLAN_INPUT));
    assert.match(planErr.message, /^SITE_BACKUP_FORBIDDEN: /);
    assert.ok(planErr.message.includes(denied), `the refusal names '${denied}'`);

    const pushErr = await rejection(call(h.pushTool, { planId: "anything" }, { emitSurface: async () => undefined }));
    assert.match(pushErr.message, /^SITE_BACKUP_FORBIDDEN: /);

    assert.equal(h.github.calls.length, 0);
    assert.equal(h.dbOps.captureCalls.length, 0);
    assert.equal(h.surfaceExchanges.size(), 0);
  }
});

test("a push refused for permissions does not use up the plan", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);

  h.setAllow((permission) => permission !== "custom-credentials.write");
  await rejection(call(h.pushTool, { planId }, { emitSurface: async () => undefined }));

  h.setAllow(() => true);
  const { pending } = await beginCall(h, planId);
  assert.equal(((await pending) as Result).pushed, true);
});

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

test("no saved GitHub credential is CREDENTIAL_NOT_FOUND; a named label that does not exist lists the saved ones", async (t) => {
  const h = harness(t);

  const none = await plan(h);
  assert.equal(none.code, "CREDENTIAL_NOT_FOUND");
  assert.match(none.message as string, /none are saved/);

  await h.seed("github");
  const wrong = await plan(h, { ...PLAN_INPUT, credential: "gh-backup" });
  assert.equal(wrong.code, "CREDENTIAL_NOT_FOUND");
  assert.match(wrong.message as string, /'gh-backup'/);
  assert.match(wrong.message as string, /saved labels: 'github'/);
  assert.equal(h.github.calls.length, 0);
});

// Demo dry run 2026-10-05: chat's "Connect GitHub" form saves into the source-control store, but the
// backup read only custom credentials, so a person who filled the form in was still told
// CREDENTIAL_NOT_FOUND and sent to the Access Tokens page.
test("a GitHub connection saved through chat's Connect GitHub form is used by the plan and the push", async (t) => {
  const h = harness(t);
  await h.seedConnection("GitHub backup");

  const planned = await plan(h);
  assert.equal(planned.planned, true, `the plan should succeed: ${JSON.stringify(planned)}`);
  assert.equal(planned.credential, "GitHub backup");
  assert.ok(h.github.calls.every((c) => c.method === "GET"));

  const { pending } = await beginCall(h, planned.planId as string);
  const pushed = await pending;
  assert.equal(pushed.pushed, true, `the push should succeed: ${JSON.stringify(pushed)}`);
  assert.deepEqual(h.github.unexpected, []);
});

test("two saved GitHub credentials are CREDENTIAL_AMBIGUOUS until one is named", async (t) => {
  const h = harness(t);
  await h.seed("github-a");
  await h.seed("github-b");
  await h.seed("gitlab", "https://gitlab.example.com/api/v4");

  const ambiguous = await plan(h);
  assert.equal(ambiguous.code, "CREDENTIAL_AMBIGUOUS");
  assert.match(ambiguous.message as string, /'github-a'/);
  assert.match(ambiguous.message as string, /'github-b'/);
  assert.doesNotMatch(ambiguous.message as string, /gitlab/, "only credentials pointing at api.github.com are candidates");

  const named = await plan(h, { ...PLAN_INPUT, credential: "github-b" });
  assert.equal(named.planned, true);
  assert.equal(named.credential, "github-b");
});

test("a credential saved under a different Site key is CREDENTIAL_UNREADABLE, not CREDENTIAL_NOT_FOUND, and touches neither GitHub nor the database", async (t) => {
  // Sealed with the harness keyring, opened with a sealer over a DIFFERENT keyring: the real failure.
  const h = harness(t, { openSealer: () => new AesGcmSecretSealer(new InMemoryKeyring()) });
  await h.seed();

  const result = await plan(h);

  assert.equal(result.planned, false);
  assert.equal(result.code, "CREDENTIAL_UNREADABLE");
  assert.match(result.message as string, /'github' is saved but cannot be decrypted with this server's Site key: it differs/);
  assert.doesNotMatch(result.message as string, /could not be decrypted \(secret store|authenticate|unconfigured/i, "never the decrypt error's own text");
  assert.equal(h.github.calls.length, 0);
  assert.equal(h.dbOps.captureCalls.length, 0);
});

test("the unreadable-credential message follows the Site key's status and never echoes the decrypt error", async (t) => {
  const cases = [
    { status: { active: true }, expected: /differs from the one the credential was saved under/ },
    { status: { active: false }, expected: /this server has no Site key \(TOVU_SITE_KEY is not set/ },
    { status: { active: false, invalid: true }, expected: /set but malformed/ },
  ];
  for (const { status, expected } of cases) {
    const h = harness(t, { openSealer: (sealedWith) => new LeakySealer(sealedWith), siteKeyStatus: () => status });
    await h.seed();
    const result = await plan(h);
    assert.equal(result.code, "CREDENTIAL_UNREADABLE");
    assert.match(result.message as string, expected);
    const published = JSON.stringify(result);
    assert.doesNotMatch(published, /LEAK-SENTINEL/);
    assert.doesNotMatch(published, new RegExp(TOKEN));
    assert.deepEqual(h.logLines, [], "nothing about the decrypt failure is logged either");
  }
});

test("site-key plan §A3b: a site with an ACTIVE per-site key file is never told 'this server has no Site key' — the default status is site-aware, not env/legacy-only", async (t) => {
  const home = isolateHomeDir(t);
  const h = harness(t, { openSealer: (sealedWith) => new LeakySealer(sealedWith), useDefaultSiteKeyStatus: true });
  await h.seed();
  // `makeSite` stamps `.site-meta.json` with `{siteId: "s1"}`, so this site's resolved siteKeyId is
  // "s1" (site-key-sources.ts's `resolveSiteKeyId`: siteKeyId defaults to siteId when absent) — mint
  // a real, valid per-site key file at the path that id resolves to, and nothing else (no env var,
  // no legacy shared file), so ONLY a site-aware status can see it as active.
  const perSiteKeyPath = path.join(home, ".tovu", "site-keys", "s1.hex");
  mkdirSync(path.dirname(perSiteKeyPath), { recursive: true });
  writeFileSync(perSiteKeyPath, randomBytes(32).toString("hex"));

  const result = await plan(h);

  assert.equal(result.code, "CREDENTIAL_UNREADABLE");
  assert.doesNotMatch(
    result.message as string,
    /this server has no Site key/,
    "wrong: an env/legacy-only check cannot see the ACTIVE per-site key file, so it wrongly reports none configured at all"
  );
  assert.match(
    result.message as string,
    /differs from the one the credential was saved under/,
    "right: the per-site key IS active, so the credential is unreadable for a different reason (wrong key or a corrupted row), not because no key exists"
  );
});

test("a network failure is NETWORK_UNREACHABLE; the detail goes to the server log only, never the token", async (t) => {
  const h = harness(t);
  await h.seed();
  h.github.state.networkDown = true;

  const result = await plan(h);

  assert.equal(result.code, "NETWORK_UNREACHABLE");
  assert.equal(h.logLines.length, 1);
  assert.match(h.logLines[0]!, /^\[site-backup\] site_backup_plan: failed code=network-unreachable/);
  assert.doesNotMatch(h.logLines.join("\n") + JSON.stringify(result), new RegExp(TOKEN));
});

// ---------------------------------------------------------------------------
// site_backup_push
// ---------------------------------------------------------------------------

test("the push re-checks the repository, uploads only the database as a blob (text rides inline), then 2 trees -> commit -> non-force ref update", async (t) => {
  const h = harness(t);
  h.github.files.set("demo-site/obsolete.txt", Buffer.from("Old backup file"));
  h.github.state.folderExists = true;
  await h.seed();
  const planned = await plan(h);
  const callsAfterPlan = h.github.calls.length;

  const result = (await call(h.pushTool, { planId: planned.planId })) as Result;

  const manifestBytes = h.github.files.get("demo-site/tovu-backup.json");
  assert.ok(manifestBytes, "the manifest is committed into the folder");
  assert.deepEqual(result, {
    pushed: true,
    commitSha: "new-commit",
    commitUrl: "https://github.com/octo/backups/commit/new-commit",
    repository: "octo/backups",
    branch: "main",
    folder: "demo-site",
    filesWritten: (planned.fileCount as number) + 1,
    totalBytes: DB_BYTES.length + Buffer.byteLength('{"name":"Demo Site"}') + Buffer.byteLength('{"siteId":"s1"}') + Buffer.byteLength("IMG") + Buffer.byteLength("<html>") + Buffer.byteLength("# skill") + manifestBytes.length,
  });
  assert.deepEqual(h.github.unexpected, []);

  const pushCalls = h.github.calls.slice(callsAfterPlan).map((c) => `${c.method} ${new URL(c.url).pathname.replace(/^\/repos\/octo\/backups/, "")}`);
  assert.deepEqual(pushCalls, [
    "GET ",
    "GET /git/ref/heads/main",
    "GET /git/commits/tip-1",
    "GET /contents/demo-site",
    "POST /git/blobs",
    "POST /git/trees",
    "POST /git/trees",
    "POST /git/commits",
    "PATCH /git/refs/heads/main",
  ]);
  assert.deepEqual(h.github.blobContents.map((bytes) => [...bytes]), [DB_BYTES], "only the database (it holds a NUL byte) is a blob; the plan's snapshot");
  const folderTree = JSON.parse(Buffer.from(h.github.writes()[1]!.body ?? "{}").toString("utf8")) as { base_tree?: string; tree: { path: string; sha?: string; content?: string }[] };
  assert.equal(folderTree.base_tree, undefined, "the folder starts empty, so stale files in it disappear");
  assert.deepEqual(folderTree.tree.filter((entry) => entry.sha !== undefined).map((entry) => entry.path), ["database/content.db"]);

  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { format: string; files: { path: string }[] };
  assert.equal(manifest.format, "tovu-site-backup");
  assert.equal(manifest.files.length, planned.fileCount);
  assert.equal(folderTree.tree.at(-1)!.path, "tovu-backup.json", "the manifest is the folder's last entry");
  assert.deepEqual([...h.github.files.keys()].sort(), [
    "README.md", "demo-site/database/content.db", "demo-site/settings/.site-meta.json", "demo-site/settings/config.json",
    "demo-site/skills/ws/workspace-local/notes/SKILL.md", "demo-site/themes/static/demo/index.html", "demo-site/tovu-backup.json",
    "demo-site/uploads/ws/workspace-local/blobs/ab/abcdef",
  ].sort());
  for (const [name, bytes] of [
    ["README.md", Buffer.from("Outside the backup folder")], ["demo-site/database/content.db", Buffer.from(DB_BYTES)],
    ["demo-site/settings/.site-meta.json", Buffer.from('{"siteId":"s1"}')], ["demo-site/settings/config.json", Buffer.from('{"name":"Demo Site"}')],
    ["demo-site/skills/ws/workspace-local/notes/SKILL.md", Buffer.from("# skill")], ["demo-site/themes/static/demo/index.html", Buffer.from("<html>")],
    ["demo-site/uploads/ws/workspace-local/blobs/ab/abcdef", Buffer.from("IMG")],
  ] as const) assert.deepEqual(h.github.files.get(name), bytes, name);

  const writes = h.github.writes();
  const rootTree = JSON.parse(Buffer.from(writes.at(-3)!.body ?? "{}").toString("utf8")) as { base_tree: string };
  assert.equal(rootTree.base_tree, "tree-of-tip-1", "everything outside the folder is kept");
  const commit = JSON.parse(Buffer.from(writes.at(-2)!.body ?? "{}").toString("utf8")) as { parents: string[]; message: string };
  assert.deepEqual(commit.parents, ["tip-1"], "committed on the planned parent");
  assert.equal(commit.message, `Tovu site backup: Demo Site (${NOW})`);
  const ref = JSON.parse(Buffer.from(writes.at(-1)!.body ?? "{}").toString("utf8")) as Record<string, unknown>;
  assert.equal("force" in ref, false, "never a force push");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
  assert.deepEqual(h.sleeps, [], "nothing failed, so nothing was retried");
});

test("a pre-aborted push abandons without a dialog or host writes", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const controller = new AbortController();
  controller.abort();
  const emitted: unknown[] = [];
  const before = h.github.calls.length;
  assert.deepEqual(await call(h.pushTool, { planId }, { signal: controller.signal, emitSurface: async (surface) => { emitted.push(surface); } }),
    { pushed: false, cancelled: false, reason: "abandoned" });
  assert.deepEqual(emitted, []);
  assert.equal(h.github.calls.length, before);
  assert.deepEqual(h.github.writes(), []);
});

test("a planId works once: a second push with it is PLAN_NOT_FOUND and raises no dialog", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const first = await beginCall(h, planId);
  assert.equal((await first.pending).pushed, true);
  const callsAfterPush = h.github.calls.length;

  const emitted: unknown[] = [];
  const second = (await call(h.pushTool, { planId }, { emitSurface: async (s) => void emitted.push(s) })) as Result;

  assert.equal(second.pushed, false);
  assert.equal(second.code, "PLAN_NOT_FOUND");
  assert.match(second.message as string, /Call site_backup_plan again/);
  assert.equal(emitted.length, 0);
  assert.equal(h.github.calls.length, callsAfterPush);
});

test("another principal's planId is PLAN_NOT_FOUND, and the plan stays usable by the one who made it", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);

  const emitted: unknown[] = [];
  const stolen = (await call(h.pushTool, { planId }, { principalId: OTHER_PRINCIPAL, emitSurface: async (s) => void emitted.push(s) })) as Result;
  assert.equal(stolen.code, "PLAN_NOT_FOUND");
  assert.equal(emitted.length, 0, "no dialog for someone else's plan");

  const { pending } = await beginCall(h, planId);
  assert.equal(((await pending) as Result).pushed, true);
});

test("an expired plan is PLAN_EXPIRED", async (t) => {
  let nowMs = Date.parse(NOW);
  const h = harness(t, { planNowMs: () => nowMs });
  await h.seed();
  const planId = await plannedId(h);
  nowMs += 10 * 60 * 1000 + 1;

  const result = (await call(h.pushTool, { planId }, { emitSurface: async () => undefined })) as Result;
  assert.equal(result.code, "PLAN_EXPIRED");
  assert.match(result.message as string, /10 minutes/);
});

test("a repository made public between plan and confirm is refused at push time, before any write", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const { pending } = await beginCall(h, planId);

  h.github.state.visibility = "public";
  const result = await pending;

  assert.equal(result.pushed, false);
  assert.equal(result.code, "REPOSITORY_NOT_PRIVATE");
  assert.deepEqual(h.github.writes(), []);
});

test("a branch that moved since the plan is DIVERGED_BRANCH, before a single blob is uploaded", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const { pending } = await beginCall(h, planId);

  h.github.state.tip = "tip-2";
  const result = await pending;

  assert.equal(result.code, "DIVERGED_BRANCH");
  assert.match(result.message as string, /moved since the backup was planned.*Nothing was written/);
  assert.deepEqual(h.github.writes(), []);
});

test("a branch that moves during the push (GitHub 422 on the ref update) is DIVERGED_BRANCH, with exactly one non-force attempt", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const { pending } = await beginCall(h, planId);

  h.github.state.patchStatus = 422;
  const result = await pending;

  assert.equal(result.code, "DIVERGED_BRANCH");
  assert.equal(h.github.calls.filter((c) => c.method === "PATCH").length, 1);
});

test("a file changed on disk since the plan is PLAN_STALE, and no tree, commit or ref update is made", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const { pending } = await beginCall(h, planId);

  writeFileSync(path.join(h.site.root, "themes", "static", "demo", "index.html"), "<html>changed after the plan</html>");
  const result = await pending;

  assert.equal(result.code, "PLAN_STALE");
  assert.match(result.message as string, /changed since the plan/);
  assert.ok(h.github.writes().every((c) => c.url.endsWith("/git/blobs")), "only orphan blobs, never a tree, commit or ref update");
});

test("a credential that becomes unreadable between plan and confirm is CREDENTIAL_UNREADABLE at push time, with no write", async (t) => {
  let broken = false;
  const h = harness(t, {
    openSealer: (sealedWith) => ({
      seal: (input) => sealedWith.seal(input),
      open: (input, optional) => (broken ? Promise.reject(new Error("LEAK-SENTINEL")) : sealedWith.open(input, optional)),
    }),
  });
  await h.seed();
  const planId = await plannedId(h);
  const { pending } = await beginCall(h, planId);

  broken = true;
  const result = await pending;

  assert.equal(result.code, "CREDENTIAL_UNREADABLE");
  assert.doesNotMatch(JSON.stringify(result), /LEAK-SENTINEL/);
  assert.deepEqual(h.github.writes(), []);
});

test("the site_backup_* tool copy names no host: the host's name, API origin and file limit come from its plugin via source_control_get_capabilities", () => {
  const copy = JSON.stringify(siteBackupAgentToolCatalog);
  assert.doesNotMatch(copy, /github|100 MiB/i);
  assert.match(copy, /source_control_get_capabilities lists each host with its label, apiOrigin and maxFileBytes/);
});

 test("n06: repository write runs without a confirmation channel", async (t) => {
  const h = harness(t);
  await h.seed();
  const id = await plannedId(h);
  const result = await call(h.pushTool, {planId: id}) as Result;
  assert.equal(result.pushed, true);
  assert.equal(result.commitSha, "new-commit");
  assert.equal(h.github.writes().at(-1)?.method, "PATCH");
  assert.equal(h.surfaceExchanges.size(), 0);
});

// ---------------------------------------------------------------------------
// site_backup_push — large sites (a 212 MiB, 1510-file backup timed out live on 2026-10-06)
// ---------------------------------------------------------------------------

/** Resolves once `ready()` holds (checked every millisecond), or after `maxMs` so a regression fails
 *  on its assertion instead of hanging the suite. */
function when(ready: () => boolean, maxMs = 2000): Promise<void> {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve) => {
    const tick = (): void => void (ready() || Date.now() > deadline ? resolve() : setTimeout(tick, 1));
    tick();
  });
}

/** A gate a test opens by hand: blob POSTs wait on it while it is shut. */
function shutGate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** A binary (it holds a NUL byte, so it cannot ride inline) unique to `n`. */
function binary(n: number): Buffer {
  return Buffer.concat([Buffer.from([0x00, 0xff]), Buffer.from(`media-${n}`)]);
}

test("a large site: each distinct binary is one blob, at most 4 in flight; ~750 text files ride inline over 3 chained folder trees; one commit", async (t) => {
  const h = harness(t);
  const blobsDir = path.join(h.site.root, "uploads", "ws", "workspace-local", "blobs", "cd");
  mkdirSync(blobsDir, { recursive: true });
  for (let n = 0; n < 40; n++) writeFileSync(path.join(blobsDir, `media-${String(n).padStart(2, "0")}`), binary(n));
  writeFileSync(path.join(blobsDir, "media-copy-of-07"), binary(7));
  for (let n = 0; n < 700; n++) write(path.join(h.site.root, "themes", "static", "big", `page-${String(n).padStart(3, "0")}.html`), `<p>page ${n}</p>`);
  await h.seed();
  const planned = await plan(h);
  const fileCount = planned.fileCount as number;
  assert.equal(fileCount, 6 + 41 + 700, "the small site's database and 5 files, 41 binaries, 700 pages");
  // Shut until four blob requests are waiting at once: a fifth in flight would be a regression.
  h.github.blobGate = when(() => h.github.blobsInFlight >= 4);

  const result = (await call(h.pushTool, { planId: planned.planId })) as Result;

  assert.equal(result.pushed, true, JSON.stringify(result));
  assert.equal(result.filesWritten, fileCount + 1, "every planned file and the manifest");
  assert.deepEqual(h.github.unexpected, []);
  assert.equal(h.github.maxBlobsInFlight, 4, "four uploads overlap, never more");
  const writes = h.github.writeRoutes();
  assert.equal(writes.filter((w) => w === "POST /git/blobs").length, 1 + 40, "the database and each DISTINCT binary once (the copy of media-07 is deduped)");
  assert.deepEqual(writes.slice(41), ["POST /git/trees", "POST /git/trees", "POST /git/trees", "POST /git/trees", "POST /git/commits", "PATCH /git/refs/heads/main"]);
  const trees = h.github.writes().filter((c) => c.url.endsWith("/git/trees")).map((c) => JSON.parse(Buffer.from(c.body ?? "{}").toString("utf8")) as { base_tree?: string; tree: unknown[] });
  assert.deepEqual(trees.map((tree) => tree.tree.length), [300, 300, fileCount + 1 - 600, 1], "folder entries in chunks of 300, then the root tree grafts the folder");
  assert.deepEqual(trees.map((tree) => tree.base_tree), [undefined, "new-tree-1", "new-tree-2", "tree-of-tip-1"], "each chunk builds on the previous one; the folder starts empty");
  assert.equal(h.github.files.get("demo-site/themes/static/big/page-699.html")?.toString("utf8"), "<p>page 699</p>");
  assert.deepEqual(h.github.files.get("demo-site/uploads/ws/workspace-local/blobs/cd/media-copy-of-07"), binary(7));
  assert.deepEqual(h.github.files.get("demo-site/uploads/ws/workspace-local/blobs/cd/media-39"), binary(39));
});

test("a transient blob failure (502, then a dropped connection) is retried with backoff, and the backup still lands as one commit", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  h.github.blobFaults.push({ status: 502 }, { throws: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });

  const result = (await call(h.pushTool, { planId })) as Result;

  assert.equal(result.pushed, true, JSON.stringify(result));
  assert.deepEqual(h.sleeps, [2000, 4000], "doubling backoff between the three tries");
  assert.deepEqual(h.github.writeRoutes(), ["POST /git/blobs", "POST /git/blobs", "POST /git/blobs", "POST /git/trees", "POST /git/trees", "POST /git/commits", "PATCH /git/refs/heads/main"]);
  assert.deepEqual([...h.github.files.get("demo-site/database/content.db")!], DB_BYTES);
});

test("a final blob failure (422) names the file, is not retried, and commits nothing", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  h.github.blobFaults.push({ status: 422, message: "Validation Failed" });

  const result = (await call(h.pushTool, { planId })) as Result;

  assert.equal(result.pushed, false);
  assert.equal(result.code, "PROVIDER_ERROR");
  assert.match(result.message as string, /^uploading 'database\/content\.db' failed: .*Validation Failed/);
  assert.deepEqual(h.sleeps, []);
  assert.deepEqual(h.github.writeRoutes(), ["POST /git/blobs"], "no tree, commit or ref update");
});

test("a push past its wait budget returns inProgress with progress; re-calling with the same planId waits on the SAME upload, which lands once", async (t) => {
  const h = harness(t, { pushWaitMs: 20 });
  await h.seed();
  const planId = await plannedId(h);
  const gate = shutGate();
  h.github.blobGate = gate.promise;

  const first = (await call(h.pushTool, { planId })) as Result;
  assert.equal(first.inProgress, true, JSON.stringify(first));
  assert.equal(first.planId, planId);
  const progress = first.progress as { filesDone: number; filesTotal: number; bytesDone: number; bytesTotal: number };
  assert.deepEqual(progress, { filesDone: 5, filesTotal: 6, bytesDone: progress.bytesTotal - DB_BYTES.length, bytesTotal: progress.bytesTotal }, "the inline text is done; the database blob is held");
  assert.match(first.message as string, /Call site_backup_push again with the same planId/);

  const second = (await call(h.pushTool, { planId })) as Result;
  assert.equal(second.inProgress, true, "still uploading, and the plan was not taken a second time");

  gate.open();
  const third = (await call(h.pushTool, { planId })) as Result;
  assert.equal(third.pushed, true, JSON.stringify(third));
  const writes = h.github.writeRoutes();
  assert.equal(writes.filter((w) => w === "POST /git/blobs").length, 1, "one upload, not one per call");
  assert.equal(writes.filter((w) => w === "POST /git/commits").length, 1);

  const fourth = (await call(h.pushTool, { planId })) as Result;
  assert.equal(fourth.code, "PLAN_NOT_FOUND", "a collected outcome is forgotten; the planId is spent");
});

test("stopping the run while the push waits abandons the upload: no further file, no tree, no commit", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const gate = shutGate();
  h.github.blobGate = gate.promise;
  const controller = new AbortController();

  const pending = call(h.pushTool, { planId }, { signal: controller.signal }) as Promise<Result>;
  await when(() => h.github.blobsInFlight === 1);
  controller.abort();
  assert.deepEqual(await pending, { pushed: false, cancelled: false, reason: "abandoned" });

  gate.open();
  await when(() => h.github.blobsInFlight === 0);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(h.github.writeRoutes(), ["POST /git/blobs"], "the blob already in flight finishes; nothing after it");
});

test("a media file over the host's per-file limit is left out of the plan and named in skipped; the rest is backed up", async (t) => {
  const lowered: NonNullable<SiteBackupToolDeps["loadSourceControlProviders"]> = async (workspaceId) => {
    const registry = await githubFromSource(workspaceId);
    const lower = (loaded: ReturnType<typeof registry.list>[number]) => ({ ...loaded, descriptor: { ...loaded.descriptor, maxFileBytes: 1000 } });
    return { ...registry, list: () => registry.list().map(lower), get: (id: string) => { const found = registry.get(id); return found ? lower(found) : undefined; } };
  };
  const h = harness(t, { providers: lowered });
  write(path.join(h.site.root, "uploads", "ws", "workspace-local", "blobs", "ef", "huge"), "x".repeat(2048));
  await h.seed();

  const planned = await plan(h);

  assert.equal(planned.planned, true, JSON.stringify(planned));
  assert.deepEqual((planned.skipped as { path: string }[]).map((s) => s.path), ["uploads/ws/workspace-local/blobs/ef/huge"]);
  assert.match((planned.skipped as { reason: string }[])[0]!.reason, /^2(\.0)? KiB, over GitHub's 1000 B per-file limit$/);
  assert.equal((planned.files as { path: string }[]).some((f) => f.path.endsWith("/huge")), false);

  const result = (await call(h.pushTool, { planId: planned.planId })) as Result;
  assert.equal(result.pushed, true);
  assert.equal(h.github.files.has("demo-site/uploads/ws/workspace-local/blobs/ef/huge"), false);
});

/** Keep the bundled provider's real operations; vary only the host port under test. */
function providerWith(
  operations: Partial<SourceControlProviderOperations>,
  descriptor: Partial<SourceControlProviderDescriptor> = {},
): NonNullable<SiteBackupToolDeps["loadSourceControlProviders"]> {
  return async workspaceId => {
    const registry = await githubFromSource(workspaceId);
    const entries = registry.list().map(entry => ({ ...entry, descriptor: { ...entry.descriptor, ...descriptor }, module: {
      ...entry.module, create: (kit: Parameters<typeof entry.module.create>[0]) => ({ ...entry.module.create(kit), ...operations }),
    } }));
    return { ...registry, list: () => entries, get: id => entries.find(entry => entry.descriptor.id === id) };
  };
}

function overriddenTool(h: ReturnType<typeof harness>, id: string, overrides: Partial<SiteBackupToolDeps>): ToolRegistration {
  const registration = buildSiteBackupRegistrations({ ...h.deps, ...overrides }, { surfaceExchanges: h.surfaceExchanges }).find(r => r.descriptor.id === id);
  assert.ok(registration);
  return registration;
}

for (const [name, input, message] of [
  ["non-string credential", { credential: 1 }, /'credential' must be a string/],
  ["non-string branch", { branch: false }, /'branch' must be a string/],
  ["non-string folder", { folder: [] }, /'folder' must be a string/],
  ["non-string commit message", { commitMessage: null }, /'commitMessage' must be a string/],
  ["null include", { include: null }, /'include' must be an object/],
  ["array include", { include: [] }, /'include' must be an object/],
  ["scalar include", { include: true }, /'include' must be an object/],
  ["non-boolean switch", { include: { media: "false" } }, /'include.media' must be true or false/],
] as const) test(`plan refuses ${name} before authorization or host access`, async t => {
  const h = harness(t);
  const error = await rejection(call(h.planTool, { ...PLAN_INPUT, ...input }));
  assert.match(error.message, message);
  assert.deepEqual(h.authorized, []);
  assert.deepEqual(h.github.calls, []);
  assert.deepEqual(h.dbOps.captureCalls, []);
});

test("an explicit branch and commit message replace existing folder contents with the reviewed plan", async t => {
  const h = harness(t);
  await h.seed();
  h.github.state.folderExists = true;
  h.github.files.set("demo-site/old.txt", Buffer.from("previous backup"));
  const planned = await plan(h, { ...PLAN_INPUT, branch: "main", folder: "demo-site", commitMessage: "Reviewed backup", include: { database: false } });
  assert.equal(planned.planned, true);
  assert.equal(planned.folderExists, true);
  assert.match(String(planned.nextStep), /current contents will be replaced/);
  const pushed = await call(h.pushTool, { planId: planned.planId }) as Result;
  assert.equal(pushed.pushed, true);
  const commit = h.github.calls.find(request => request.method === "POST" && request.url.endsWith("/git/commits"));
  assert.ok(commit);
  assert.equal(JSON.parse(Buffer.from(commit.body!).toString("utf8")).message, "Reviewed backup");
  assert.equal(h.github.files.has("demo-site/old.txt"), false);
  assert.equal(h.github.files.has("demo-site/tovu-backup.json"), true);
  assert.equal(h.github.files.get("README.md")?.toString("utf8"), "Outside the backup folder");
});

for (const config of [undefined, "invalid json", JSON.stringify({ name: " " }), JSON.stringify({ name: 42 })]) {
  test(`backup uses the site folder name when config is ${config ?? "missing"}`, async t => {
    const h = harness(t);
    await h.seed();
    const configPath = path.join(h.site.root, "config.json");
    if (config === undefined) rmSync(configPath);
    else write(configPath, config);
    const id = await plannedId(h);
    const taken = h.deps.siteBackupPlanStore!.take({ planId: id, principalId: OWNER_PRINCIPAL, workspaceId: WORKSPACE_ID });
    assert.equal(taken.ok, true);
    if (!taken.ok) assert.fail("expected the saved plan");
    assert.deepEqual(taken.plan.site, { name: "demo-site", folderName: "demo-site" });
    assert.equal(taken.plan.commitMessage, `Tovu site backup: demo-site (${NOW})`);
  });
}

test("provider load refusals are logged and a missing provider returns an actionable refusal", async t => {
  const h = harness(t, { providers: async () => ({ list: () => [], get: () => undefined, refusals: ["host plugin is unavailable"] }) });
  const result = await plan(h);
  assert.equal(result.code, "NO_PROVIDER");
  assert.equal(result.planned, false);
  assert.match(String(result.message), /plugin|provider/i);
  assert.deepEqual(h.logLines, ["[site-backup] host plugin is unavailable"]);
  assert.deepEqual(h.dbOps.captureCalls, []);
});

test("an unrecognized failure code from a JavaScript host plugin becomes PROVIDER_ERROR", async t => {
  // Plugin .mjs modules are runtime inputs: a newer host may return a code outside today's TS union.
  const inspectBackupRepository = async () => ({ ok: false, code: "host-maintenance", message: "The host is under maintenance" });
  const h = harness(t, { providers: providerWith({ inspectBackupRepository: inspectBackupRepository as unknown as SourceControlProviderOperations["inspectBackupRepository"] }) });
  await h.seed();
  assert.deepEqual(await plan(h), { planned: false, code: "PROVIDER_ERROR", message: "The host is under maintenance" });
  assert.deepEqual(h.dbOps.captureCalls, []);
  assert.deepEqual(h.github.writes(), []);
});

test("a named host connection must match its saved label", async t => {
  const h = harness(t);
  await h.seedConnection("Actual connection");
  const result = await plan(h, { ...PLAN_INPUT, credential: "Different connection" });
  assert.equal(result.code, "CREDENTIAL_NOT_FOUND");
  assert.match(String(result.message), /Different connection/);
  assert.deepEqual(h.github.calls, []);
});
test("an unreadable saved host connection reports the safe site-key diagnosis", async t => {
  const h = harness(t, { openSealer: inner => new LeakySealer(inner) });
  await h.seedConnection();
  const result = await plan(h);
  assert.equal(result.code, "CREDENTIAL_UNREADABLE");
  assert.match(String(result.message), /GitHub connection/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(["LEAK-SENTINEL", "gh" + "p_"].join("|")));
  assert.deepEqual(h.github.calls, []);
});

test("a credential deleted between selection and resolution is reported as missing", async t => {
  const h = harness(t);
  const saved = await h.seed();
  let reads = 0;
  const repo = { vault: h.repo.vault, findById: h.repo.findById.bind(h.repo), insert: h.repo.insert.bind(h.repo), update: h.repo.update.bind(h.repo), delete: h.repo.delete.bind(h.repo),
    listByWorkspace: async (input: { workspaceId: string }) => {
      if (++reads === 2) await h.repo.delete({ workspaceId: WORKSPACE_ID, id: saved.id });
      return h.repo.listByWorkspace(input);
    },
  };
  const result = await call(overriddenTool(h, "site_backup_plan", { customCredentialSetRepo: repo }), PLAN_INPUT) as Result;
  assert.equal(result.code, "CREDENTIAL_NOT_FOUND");
  assert.match(String(result.message), /deleted while the backup was being prepared/);
  assert.equal(await h.repo.findById({ workspaceId: WORKSPACE_ID, id: saved.id }), null);
  assert.deepEqual(h.github.calls, []);
});

for (const [providerCode, code] of [
  ["repo-not-found", "REPOSITORY_NOT_FOUND"], ["no-push-permission", "NO_PUSH_PERMISSION"], ["repo-empty", "REPOSITORY_EMPTY"],
  ["branch-not-found", "BRANCH_NOT_FOUND"], ["folder-is-file", "FOLDER_IS_FILE"], ["provider-error", "PROVIDER_ERROR"],
] as const) test(`plan maps the host's ${providerCode} refusal without taking a snapshot`, async t => {
  const h = harness(t, { providers: providerWith({ inspectBackupRepository: async () => ({ ok: false, code: providerCode, message: "Host refused the backup" }) }) });
  await h.seed();
  assert.deepEqual(await plan(h), { planned: false, code, message: "Host refused the backup" });
  assert.deepEqual(h.dbOps.captureCalls, []);
});

for (const withDetail of [true, false]) test(`snapshot failure ${withDetail ? "with" : "without"} private detail stops planning`, async t => {
  const h = harness(t);
  await h.seed();
  const dbOps: DbOpsPort = { getCapabilities: async () => withDetail
    ? { restorePoint: { kind: "file-snapshot", costClass: "cheap" } }
    : { restorePoint: { kind: "external", costClass: "unavailable" } },
    captureRestorePoint: async () => { throw new Error("private snapshot failure"); }, restoreFromArtifact: h.dbOps.restoreFromArtifact.bind(h.dbOps) };
  const result = await call(overriddenTool(h, "site_backup_plan", { dbOps }), PLAN_INPUT) as Result;
  assert.equal(result.planned, false);
  assert.equal(result.code, "DATABASE_SNAPSHOT_FAILED");
  assert.doesNotMatch(JSON.stringify(result), /private snapshot failure/);
  assert.equal(h.logLines.length, withDetail ? 1 : 0);
  assert.deepEqual(h.github.writes(), []);
});

test("a database snapshot exceeding the host limit refuses the whole plan", async t => {
  const h = harness(t, { providers: providerWith({}, { maxFileBytes: DB_BYTES.length - 1 }) });
  await h.seed();
  const result = await plan(h);
  assert.equal(result.code, "LIMIT_EXCEEDED");
  assert.match(String(result.message), /database\/content.db/);
  assert.equal(h.dbOps.captureCalls.length, 1);
  assert.deepEqual(h.github.writes(), []);
});

test("a credential deleted after planning refuses the push without writing", async t => {
  const h = harness(t);
  const saved = await h.seed();
  const id = await plannedId(h);
  await h.repo.delete({ workspaceId: WORKSPACE_ID, id: saved.id });
  const result = await call(h.pushTool, { planId: id }) as Result;
  assert.equal(result.pushed, false);
  assert.equal(result.code, "CREDENTIAL_NOT_FOUND");
  assert.deepEqual(h.github.writes(), []);
});

test("a push without site sources still diagnoses unreadable credentials using an isolated home", async t => {
  isolateHomeDir(t);
  const h = harness(t);
  await h.seed();
  const id = await plannedId(h);
  const result = await call(overriddenTool(h, "site_backup_push", {
    siteBackupSources: undefined, siteBackupSiteKeyStatus: undefined, siteAssistantSecretSealer: new LeakySealer(h.deps.siteAssistantSecretSealer),
  }), { planId: id }) as Result;
  assert.equal(result.code, "CREDENTIAL_UNREADABLE");
  assert.match(String(result.message), /this server has no Site key/);
  assert.deepEqual(h.github.writes(), []);
});

test("the contributor exposes the backup registrations and their independent risk classification", t => {
  const h = harness(t);
  const contributor = contributeSiteBackupTools();
  assert.equal(contributor.domain, "site-backup");
  assert.equal(contributor.risk, siteBackupDerivedRisk);
  assert.deepEqual(contributor.build(h.deps as never, { surfaceExchanges: h.surfaceExchanges }).map(registration => registration.descriptor.id), ["site_import_backup", "site_import_list", "site_backup_plan", "site_backup_push", "site_share_create", "site_share_list", "site_share_revoke"]);
});

test("a malformed saved API URL is ignored during automatic credential selection", async t => {
  const h = harness(t);
  const saved = await h.seed();
  const original = await h.repo.vault.find({ workspaceId: WORKSPACE_ID, id: saved.id });
  assert.ok(original);
  await h.repo.vault.put({ expectedRevision: original.revision, record: { ...original, revision: original.revision + 1, meta: { ...original.meta, baseUrl: "not-an-absolute-url" } } });
  const result = await call(overriddenTool(h, "site_backup_plan", { sourceControlCredentialSetRepo: undefined }), PLAN_INPUT) as Result;
  assert.equal(result.code, "CREDENTIAL_NOT_FOUND");
  assert.match(String(result.message), /no saved credential points at/);
  assert.deepEqual(h.github.calls, []);
});

test("a plugin host without a legacy connection kind cannot read another host's saved connection", async t => {
  const h = harness(t, { providers: providerWith({}, { id: "new-host" }) });
  await h.seedConnection();
  const result = await plan(h);
  assert.equal(result.code, "CREDENTIAL_NOT_FOUND");
  assert.deepEqual(h.github.calls, []);
});

test("a named credential for neither of two enabled hosts returns NO_PROVIDER", async t => {
  const h = harness(t, { providers: async workspaceId => {
    const registry = await githubFromSource(workspaceId);
    const github = registry.list()[0]!;
    const entries = [github, { ...github, descriptor: { ...github.descriptor, id: "second-host", apiOrigin: "https://second.example", label: "Second host" } }];
    return { ...registry, list: () => entries, get: id => entries.find(entry => entry.descriptor.id === id) };
  } });
  await h.seed("Other host", "https://third.example");
  const result = await plan(h, { ...PLAN_INPUT, credential: "Other host" });
  assert.equal(result.code, "NO_PROVIDER");
  assert.match(String(result.message), /third.example/);
  assert.deepEqual(h.github.calls, []);
});

test("a custom-repository failure during credential resolution propagates without taking a snapshot", async t => {
  const h = harness(t);
  await h.seed();
  const failure = new Error("credential repository unavailable");
  let reads = 0;
  const repo = { vault: h.repo.vault, findById: h.repo.findById.bind(h.repo), insert: h.repo.insert.bind(h.repo), update: h.repo.update.bind(h.repo), delete: h.repo.delete.bind(h.repo),
    listByWorkspace: async (input: { workspaceId: string }) => { if (++reads === 2) throw failure; return h.repo.listByWorkspace(input); },
  };
  await assert.rejects(call(overriddenTool(h, "site_backup_plan", { customCredentialSetRepo: repo }), PLAN_INPUT), error => error === failure);
  assert.deepEqual(h.dbOps.captureCalls, []);
  assert.deepEqual(h.github.calls, []);
});

test("the default failure logger receives only the host's server-safe diagnostic", async t => {
  const h = harness(t, { providers: providerWith({ inspectBackupRepository: async () => ({ ok: false, code: "network-unreachable", message: "Try again later", logDetail: "Error ECONNREFUSED" }) }) });
  await h.seed();
  const warnings: string[] = [];
  t.mock.method(console, "warn", (line: string) => { warnings.push(line); });
  const result = await call(overriddenTool(h, "site_backup_plan", { siteBackupFailureLog: undefined, siteBackupHttpClient: h.github, siteBackupSleep: undefined }), PLAN_INPUT);
  assert.deepEqual(result, { planned: false, code: "NETWORK_UNREACHABLE", message: "Try again later" });
  assert.deepEqual(warnings, ["[site-backup] site_backup_plan: failed code=network-unreachable detail=Error ECONNREFUSED"]);
  assert.deepEqual(h.github.writes(), []);
});

test("a saved source-control username is retained in the backup's authorization header", async t => {
  const h = harness(t);
  const saved = await h.seedConnection();
  const row = await h.sourceControlRepo.vault.find({ workspaceId: WORKSPACE_ID, id: saved.id });
  assert.ok(row?.sealed);
  const { buildVaultAad } = await import("@jini-ai/platform/secrets/credential-sets");
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const sealed = await sealer.seal({ plaintext: JSON.stringify({ token: TOKEN, username: "backup-user" }), key: await keyring.activeKey(), aad: buildVaultAad(row) });
  await h.sourceControlRepo.vault.put({ expectedRevision: row.revision, record: { ...row, sealed, revision: row.revision + 1 } });
  const result = await call(overriddenTool(h, "site_backup_plan", { siteAssistantSecretSealer: sealer }), PLAN_INPUT) as Result;
  assert.equal(result.planned, true);
  assert.ok(h.github.calls.length > 0);
  assert.ok(h.github.calls.every(request => request.headers?.Authorization === `Basic ${Buffer.from(`backup-user:${TOKEN}`).toString("base64")}` || request.headers?.authorization === `Basic ${Buffer.from(`backup-user:${TOKEN}`).toString("base64")}`));
});

test("the default plan store and job registry carry a backup from planning through a single-use push", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOW) });
  const h = harness(t);
  await h.seed();
  const deps = { ...h.deps, siteBackupPlanStore: undefined, siteBackupPushJobs: undefined, siteBackupNow: undefined, siteBackupPushWaitMs: undefined };
  const registrations = buildSiteBackupRegistrations(deps, { surfaceExchanges: h.surfaceExchanges });
  const planner = registrations.find(registration => registration.descriptor.id === "site_backup_plan")!;
  const pusher = registrations.find(registration => registration.descriptor.id === "site_backup_push")!;
  const planned = await call(planner, PLAN_INPUT) as Result;
  assert.equal(planned.planned, true);
  const result = await call(pusher, { planId: planned.planId }) as Result;
  assert.equal(result.pushed, true);
  const manifestBytes = h.github.files.get("demo-site/tovu-backup.json");
  assert.ok(manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(manifest.createdAt, NOW);
  const commit = h.github.calls.find(request => request.method === "POST" && request.url.endsWith("/git/commits"));
  assert.ok(commit);
  assert.equal(JSON.parse(Buffer.from(commit.body!).toString("utf8")).message, `Tovu site backup: Demo Site (${NOW})`);
  const repeated = await call(pusher, { planId: planned.planId }) as Result;
  assert.equal(repeated.code, "PLAN_NOT_FOUND");
  assert.equal(h.github.writeRoutes().filter(route => route === "POST /git/commits").length, 1);
});

test("stopping the backup as the manifest upload completes prevents the commit", async t => {
  const h = harness(t, { providers: providerWith({ backupInlineTextMaxBytes: 0 }) });
  await h.seed();
  const planId = await plannedId(h);
  let stopped = false;
  const httpClient: NonNullable<SiteBackupToolDeps["siteBackupHttpClient"]> = { send: async request => {
    const response = await h.github.send(request);
    if (request.method === "POST" && request.url.endsWith("/git/blobs")) {
      const body = JSON.parse(Buffer.from(request.body!).toString("utf8"));
      const bytes = Buffer.from(body.content, "base64");
      if (bytes.toString("utf8").includes('"tovu-site-backup"')) {
        const job = h.deps.siteBackupPushJobs!.find({ planId, principalId: OWNER_PRINCIPAL, workspaceId: WORKSPACE_ID });
        assert.ok(job);
        job.controller.abort();
        stopped = true;
      }
    }
    return response;
  } };
  const result = await call(overriddenTool(h, "site_backup_push", { siteBackupHttpClient: httpClient }), { planId });
  assert.equal(stopped, true);
  assert.deepEqual(result, { pushed: false, cancelled: false, reason: "abandoned" });
  assert.equal(h.github.writes().some(request => request.url.endsWith("/git/commits") || request.url.endsWith("/git/trees")), false);
  assert.equal(h.github.state.tip, "tip-1");
});


/** Reuse the real planner, temp site and fake host, then exercise uploads without committing. */
async function uploadFixture(t: TestContext) {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const taken = h.deps.siteBackupPlanStore!.take({ planId, principalId: OWNER_PRINCIPAL, workspaceId: WORKSPACE_ID });
  assert.ok(taken.ok);
  const built = await buildSourceControlProviderForApi({ load: githubFromSource, workspaceId: WORKSPACE_ID,
    baseUrl: "https://api.github.com", httpClient: h.github });
  assert.ok(built.ok);
  const plan: SiteBackupPlan = { ...taken.plan, files: [], database: null, totalBytes: 0,
    include: { ...taken.plan.include, database: false } };
  const target = { baseUrl: "https://api.github.com", authorization: "Bearer fixture-token", owner: "octo", repo: "backups" };
  const controller = new AbortController();
  const toRefusal = (failure: { code: string; message: string }): PushFailure => ({ ok: false, code: failure.code, message: failure.message });
  function file(name: string, bytes: Uint8Array): PlannedDiskFile {
    const absPath = path.join(h.site.root, name);
    writeFileSync(absPath, bytes);
    return { path: name, root: h.site.root, absPath, bytes: bytes.byteLength, mtimeMs: statSync(absPath).mtimeMs, identity: fileIdentity(statSync(absPath, { bigint: true })), scope: "settings" };
  }
  return { h, plan, provider: built.provider, target, controller, toRefusal, file };
}

test("an empty plan uploads only its manifest and counts no content progress", async t => {
  const f = await uploadFixture(t);
  const progress = initialPushProgress(f.plan);
  assert.deepEqual(progress, { filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 });
  const result = await uploadPlannedContent({ ...f, signal: f.controller.signal, progress,
    provider: { ...f.provider, backupInlineTextMaxBytes: undefined } });
  assert.ok(result.ok);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].path, "tovu-backup.json");
  const manifestBytes = f.h.github.blobContents[0];
  assert.ok(manifestBytes);
  assert.deepEqual(JSON.parse(manifestBytes.toString("utf8")).files, []);
  assert.deepEqual(progress, { filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 });
});

test("uploads malformed UTF-8, NUL and oversized content as blobs while preserving inline BOM and exact-limit text", async t => {
  const f = await uploadFixture(t);
  const contents = [Buffer.from([0xc3, 0x28]), Buffer.from([0]), Buffer.from("123456789"), Buffer.from("\ufeffok"), Buffer.from("12345678")];
  const names = ["invalid-utf8", "nul", "too-large", "bom", "exact-limit"];
  const plan = { ...f.plan, files: contents.map((bytes, i) => f.file(names[i], bytes)), totalBytes: contents.reduce((n, bytes) => n + bytes.length, 0) };
  const progress = initialPushProgress(plan);
  const result = await uploadPlannedContent({ ...f, plan, provider: { ...f.provider, backupInlineTextMaxBytes: 8 },
    signal: f.controller.signal, progress, concurrency: 1 });
  assert.ok(result.ok);
  assert.deepEqual(result.entries.slice(0, 5).map(entry => entry.path), names);
  assert.deepEqual(result.entries.slice(0, 3).map(entry => "blobSha" in entry), [true, true, true]);
  assert.deepEqual(f.h.github.blobContents.slice(0, 3), contents.slice(0, 3));
  assert.equal("text" in result.entries[3] && result.entries[3].text, "\ufeffok");
  assert.equal("text" in result.entries[4] && result.entries[4].text, "12345678");
  for (let index = 0; index < contents.length; index++) {
    assert.equal(result.entries[index].sha256, createHash("sha256").update(contents[index]).digest("hex"));
    assert.equal(result.entries[index].bytes, contents[index].length);
  }
  assert.deepEqual(progress, { filesDone: 5, filesTotal: 5, bytesDone: 25, bytesTotal: 25 });
});

test("a stale disk file refuses the upload before any blob or manifest is sent", async t => {
  const f = await uploadFixture(t);
  const file = f.file("changed-file", Buffer.from("original"));
  writeFileSync(file.absPath, "changed length");
  const plan = { ...f.plan, files: [file], totalBytes: file.bytes };
  const progress = initialPushProgress(plan);
  const result = await uploadPlannedContent({ ...f, plan, signal: f.controller.signal, progress });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.code, "PLAN_STALE");
  assert.match(result.message, /changed-file/);
  assert.deepEqual(f.h.github.blobContents, []);
  assert.equal(progress.filesDone, 0);
});

test("a manifest upload failure retains the mapped code and names the manifest", async t => {
  const f = await uploadFixture(t);
  const result = await uploadPlannedContent({ ...f, signal: f.controller.signal, progress: initialPushProgress(f.plan),
    provider: { ...f.provider, backupInlineTextMaxBytes: undefined,
      uploadBackupBlob: async (_target, file) => {
        assert.equal(file.path, "tovu-backup.json");
        return { ok: false, code: "provider-error", message: "manifest refused" };
      } }, toRefusal: failure => ({ ok: false, code: "HOST_REFUSED", message: failure.message }) });
  assert.deepEqual(result, { ok: false, code: "HOST_REFUSED", message: "uploading 'tovu-backup.json' failed: manifest refused" });
});

test("an aborted empty plan sends neither content nor manifest", async t => {
  const f = await uploadFixture(t);
  f.controller.abort();
  assert.deepEqual(await uploadPlannedContent({ ...f, signal: f.controller.signal, progress: initialPushProgress(f.plan) }), CANCELLED);
  assert.deepEqual(f.h.github.blobContents, []);
});

test("zero requested concurrency still uploads every file sequentially", async t => {
  const f = await uploadFixture(t);
  const files = [f.file("one", Buffer.from([1])), f.file("two", Buffer.from([2]))];
  const plan = { ...f.plan, files, totalBytes: 2 };
  const progress = initialPushProgress(plan);
  const result = await uploadPlannedContent({ ...f, plan, signal: f.controller.signal, progress, concurrency: 0,
    provider: { ...f.provider, backupInlineTextMaxBytes: undefined } });
  assert.ok(result.ok);
  assert.deepEqual(result.entries.map(entry => entry.path), ["one", "two", "tovu-backup.json"]);
  assert.equal(f.h.github.maxBlobsInFlight, 1);
  assert.deepEqual(progress, { filesDone: 2, filesTotal: 2, bytesDone: 2, bytesTotal: 2 });
});

test("simultaneous upload failures keep the first failure and stop workers taking another file", { timeout: 5_000 }, async t => {
  const f = await uploadFixture(t);
  const files = [1, 2, 3].map(n => f.file(`file-${n}`, Buffer.from([n])));
  const plan = { ...f.plan, files, totalBytes: 3 };
  const progress = initialPushProgress(plan);
  const started: string[] = [];
  let bothStarted!: () => void;
  const ready = new Promise<void>(resolve => { bothStarted = resolve; });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.after(release);
  const pending = uploadPlannedContent({ ...f, plan, signal: f.controller.signal, progress, concurrency: 2,
    provider: { ...f.provider, backupInlineTextMaxBytes: undefined, uploadBackupBlob: async (_target, file) => {
      started.push(file.path);
      if (started.length === 2) bothStarted();
      await gate;
      return { ok: false, code: "provider-error", message: `refused ${file.path}` };
    } } });
  await ready;
  release();
  assert.deepEqual(await pending, { ok: false, code: "provider-error", message: `uploading '${started[0]}' failed: refused ${started[0]}` });
  assert.deepEqual(new Set(started), new Set(["file-1", "file-2"]));
  assert.equal(progress.filesDone, 0);
});

test("inline text stops at the aggregate budget and sends subsequent content as blobs", async t => {
  const f = await uploadFixture(t);
  const chunk = Buffer.alloc(32 * 1024 * 1024, "x");
  const files = [f.file("half-budget-1", chunk), f.file("half-budget-2", chunk), f.file("over-budget", Buffer.from("y"))];
  const plan = { ...f.plan, files, totalBytes: 64 * 1024 * 1024 + 1 };
  const progress = initialPushProgress(plan);
  const result = await uploadPlannedContent({ ...f, plan, signal: f.controller.signal, progress, concurrency: 1,
    provider: { ...f.provider, backupInlineTextMaxBytes: chunk.length } });
  assert.ok(result.ok);
  for (const entry of result.entries.slice(0, 2)) {
    assert.ok("text" in entry);
    assert.equal(entry.text.length, chunk.length);
  }
  assert.ok("blobSha" in result.entries[2]);
  assert.ok("blobSha" in result.entries[3]);
  assert.equal(f.h.github.blobContents[0].toString("utf8"), "y");
  assert.equal(progress.bytesDone, plan.totalBytes);
  assert.equal(progress.filesDone, 3);
});

for (const id of ["site_share_create", "site_share_list", "site_share_revoke", "site_import_backup", "site_import_list"]) {
  test(`${id} reports an unavailable backend after its permission check`, async t => {
    const h = harness(t);
    const result = await call(h.tools.get(id)!, {});
    assert.equal((result as Result).code, "UNAVAILABLE");
    assert.deepEqual(h.github.calls, []); assert.deepEqual(h.dbOps.captureCalls, []);
  });
}
test("share tool adapters enforce exact input contracts, pass job/principal/signal and preserve coded refusals", async t => {
  const { SiteShareRefusal } = await import("../share-policy.js");
  const h = harness(t), signal = new AbortController().signal, calls: unknown[] = [];
  let error: unknown;
  const backend = { registry: {} as never,
    create: async (input: unknown) => { calls.push(["create", input]); if (error) throw error; return { jobId: "pending" }; },
    list: async (input: unknown) => { calls.push(["list", input]); if (error) throw error; return []; },
    revoke: async (input: unknown) => { calls.push(["revoke", input]); if (error) throw error; return { status: "revoked" }; },
  } as unknown as NonNullable<SiteBackupToolDeps["siteShareBackend"]>;
  const tool = (id: string) => overriddenTool(h, id, { siteShareBackend: backend });
  const jobId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(await call(tool("site_share_create"), {}, { signal }), { jobId: "pending" });
  assert.deepEqual(await call(tool("site_share_create"), { jobId }, { signal }), { jobId: "pending" });
  assert.deepEqual(await call(tool("site_share_list"), {}), { shares: [] });
  assert.deepEqual(await call(tool("site_share_revoke"), { shareId: "share" }), { status: "revoked" });
  assert.deepEqual(calls, [["create", { principalId: OWNER_PRINCIPAL, signal }], ["create", { principalId: OWNER_PRINCIPAL, signal, jobId }], ["list", {}], ["revoke", { shareId: "share" }]]);
  calls.length = 0;
  for (const [id, input] of [["site_share_list", { extra: true }], ["site_share_revoke", { shareId: "share", extra: true }], ["site_share_create", { extra: true }], ["site_share_create", { jobId: 1 }], ["site_share_create", { jobId: "invalid" }]] as const) {
    assert.equal((await call(tool(id), input) as Result).code, "INVALID_INPUT");
  }
  assert.deepEqual(calls, []);
  error = new SiteShareRefusal({ code: "BUSY", message: "Export still running" });
  for (const [id, input] of [["site_share_create", {}], ["site_share_list", {}], ["site_share_revoke", { shareId: "share" }]] as const) assert.deepEqual(await call(tool(id), input), { ok: false, code: "BUSY", message: "Export still running" });
  error = new Error("unexpected backend failure");
  await assert.rejects(call(tool("site_share_create"), {}), thrown => thrown === error);
});
