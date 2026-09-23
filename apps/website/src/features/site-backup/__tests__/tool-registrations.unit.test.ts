import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../../custom-credentials/store.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { SiteBackupPlanStore } from "../plan-store.js";
import type { SiteBackupSources } from "../sources.js";
import { buildSiteBackupRegistrations, type SiteBackupToolDeps } from "../tool-registrations.js";

/**
 * @file `site_backup_plan` / `site_backup_push`'s proof, driven through the real registrations: a
 * real `SurfaceExchangeStore` answered with `surfaceExchanges.deliver(...)` (the human's click), real
 * sealed credentials, a real `SiteBackupPlanStore`, a throwaway site folder on disk, and a fake GitHub
 * that records every request. Nothing here reaches GitHub.
 *
 * The properties this file owns:
 * - the plan is read-only (GETs only, no dialog) and a refusal costs no database snapshot;
 * - the push writes nothing until the human confirms, and re-checks what can change in between
 *   (visibility, the branch tip, the files) before the first blob is uploaded;
 * - a planId works once, for the principal that made it;
 * - a missing credential and an undecryptable one are different codes, and the decrypt error's own
 *   text never reaches the model;
 * - both tools need `site-backup.push` AND `custom-credentials.write`.
 */

const WORKSPACE_ID = "ws-site-backup";
const OWNER_PRINCIPAL = "principal-owner";
const OTHER_PRINCIPAL = "principal-other";
const NOW = "2026-09-21T12:00:00.000Z";
const TOKEN = "ghp_site_backup_test_token_never_real";
const PLAN_INPUT = { owner: "octo", repo: "backups" };
const DB_BYTES = [0x53, 0x51, 0x4c, 0x00, 0xff, 0x01];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A GitHub stand-in for `octo/backups`, answering from mutable state so a test can change the world
 *  between the plan and the push. Every request is recorded; an unknown one is recorded as
 *  `unexpected` and answered 599 so it cannot pass silently. */
class FakeGitHub implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  readonly unexpected: string[] = [];
  readonly blobContents: Buffer[] = [];
  readonly state = { visibility: "private", push: true, tip: "tip-1", folderExists: false, patchStatus: 200, networkDown: false };
  private trees = 0;

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    if (this.state.networkDown) throw Object.assign(new Error("connect ECONNREFUSED 140.82.112.6:443"), { code: "ECONNREFUSED" });
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname.replace(/^\/repos\/octo\/backups/, "")}${url.search}`;
    const s = this.state;
    if (route === "GET ") {
      return json(200, { private: s.visibility === "private", visibility: s.visibility, default_branch: "main", html_url: "https://github.com/octo/backups", permissions: { push: s.push } });
    }
    if (route === "GET /git/ref/heads/main") return json(200, { object: { sha: s.tip } });
    if (route === `GET /git/commits/${s.tip}`) return json(200, { tree: { sha: `tree-of-${s.tip}` } });
    if (route === "GET /contents/demo-site?ref=main") return s.folderExists ? json(200, [{ name: "tovu-backup.json" }]) : json(404, { message: "Not Found" });
    if (route === "POST /git/blobs") {
      const body = JSON.parse(request.body ?? "{}") as { content: string; encoding: string };
      this.blobContents.push(Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8"));
      return json(201, { sha: `blob-${this.blobContents.length}` });
    }
    if (route === "POST /git/trees") return json(201, { sha: `new-tree-${++this.trees}` });
    if (route === "POST /git/commits") return json(201, { sha: "new-commit" });
    if (route === "PATCH /git/refs/heads/main") return s.patchStatus === 200 ? json(200, { object: { sha: "new-commit" } }) : json(s.patchStatus, { message: "Update is not a fast forward" });
    this.unexpected.push(route);
    return json(599, { message: "unexpected request" });
  }

  writes(): HttpRequest[] {
    return this.calls.filter((c) => c.method !== "GET");
  }
}

function json(status: number, body: unknown): HttpResponse {
  return { status, headers: {}, bodyText: JSON.stringify(body) };
}

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
      agentPluginsDir: path.join(root, "agent-plugins"),
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
  rootKeyStatus?: () => { active: boolean; invalid?: boolean };
  withoutSources?: boolean;
  planNowMs?: () => number;
}

function harness(t: TestContext, options: HarnessOptions = {}) {
  const site = makeSite(t);
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const github = new FakeGitHub();
  const dbOps = new FakeDbOps(site.parent);
  let allow = options.allow ?? (() => true);
  const authorized: string[] = [];
  const logLines: string[] = [];
  const surfaceExchanges = createSurfaceExchangeStore();
  const planStore = new SiteBackupPlanStore(options.planNowMs ? { now: options.planNowMs } : {});

  const deps: SiteBackupToolDeps = {
    authorize: async (params) => {
      authorized.push(`${params.principalId}:${params.permission}`);
      return allow(params.permission) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    workspaceId: WORKSPACE_ID,
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: options.openSealer ? options.openSealer(sealer) : sealer,
    customCredentialsHttpClient: github,
    dbOps,
    ...(options.withoutSources ? {} : { siteBackupSources: site.sources }),
    siteBackupPlanStore: planStore,
    siteBackupRootKeyStatus: options.rootKeyStatus ?? (() => ({ active: true })),
    siteBackupFailureLog: (line) => logLines.push(line),
    siteBackupNow: () => new Date(NOW),
  };
  const writeDeps: CustomCredentialWriteDeps = {
    repo,
    sealer,
    keyring,
    clock: { nowIso: () => NOW },
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
    site,
    github,
    dbOps,
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

/** Starts a push and waits for its dialog. Asserts the call is still parked. */
async function raiseDialog(h: ReturnType<typeof harness>, planId: string, principalId = OWNER_PRINCIPAL) {
  const emitted: unknown[] = [];
  const pending = call(h.pushTool, { planId }, { principalId, emitSurface: async (s) => void emitted.push(s) }) as Promise<Result>;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the push must raise exactly one dialog before it parks");
  assert.equal(await Promise.race([pending, Promise.resolve("still-waiting" as const)]), "still-waiting", "the push must wait for the human");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  return { pending, ui, exchangeId: exchangeIdFromSurface(emitted[0]) };
}

function answer(h: ReturnType<typeof harness>, exchangeId: string, decision: "confirm" | "cancel", principalId = OWNER_PRINCIPAL): void {
  h.surfaceExchanges.deliver({ exchangeId, toolId: "site_backup_push", principalId, params: { decision } });
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
  assert.deepEqual([...h.tools.keys()].sort(), ["site_backup_plan", "site_backup_push"]);
  assert.equal(h.planTool.descriptor.readOnly, true);
  assert.equal(h.pushTool.descriptor.readOnly, false);
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
  const { pending, exchangeId } = await raiseDialog(h, planId);
  answer(h, exchangeId, "cancel");
  assert.deepEqual(await pending, { pushed: false, cancelled: true });
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

test("a credential saved under a different Site Token is CREDENTIAL_UNREADABLE, not CREDENTIAL_NOT_FOUND, and touches neither GitHub nor the database", async (t) => {
  // Sealed with the harness keyring, opened with a sealer over a DIFFERENT keyring: the real failure.
  const h = harness(t, { openSealer: () => new AesGcmSecretSealer(new InMemoryKeyring()) });
  await h.seed();

  const result = await plan(h);

  assert.equal(result.planned, false);
  assert.equal(result.code, "CREDENTIAL_UNREADABLE");
  assert.match(result.message as string, /'github' is saved but cannot be decrypted with this server's Site Token: it differs/);
  assert.doesNotMatch(result.message as string, /could not be decrypted \(secret store|authenticate|unconfigured/i, "never the decrypt error's own text");
  assert.equal(h.github.calls.length, 0);
  assert.equal(h.dbOps.captureCalls.length, 0);
});

test("the unreadable-credential message follows the Site Token's status and never echoes the decrypt error", async (t) => {
  const cases = [
    { status: { active: true }, expected: /differs from the one the credential was saved under/ },
    { status: { active: false }, expected: /this server has no Site Token \(TOVU_INTEGRATIONS_ROOT_KEY is not set/ },
    { status: { active: false, invalid: true }, expected: /set but malformed/ },
  ];
  for (const { status, expected } of cases) {
    const h = harness(t, { openSealer: (sealedWith) => new LeakySealer(sealedWith), rootKeyStatus: () => status });
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

test("the push raises the dialog and touches GitHub not at all while it waits; confirm re-checks, then blobs -> 2 trees -> commit -> non-force ref update", async (t) => {
  const h = harness(t);
  await h.seed();
  const planned = await plan(h);
  const callsAfterPlan = h.github.calls.length;

  const { pending, ui, exchangeId } = await raiseDialog(h, planned.planId as string);
  assert.equal(h.github.calls.length, callsAfterPlan, "no request of any kind before the human answers");
  assert.match(ui.resource.text, /octo\/backups/);
  assert.match(ui.resource.text, /demo-site/);
  assert.match(ui.resource.text, /main/);

  answer(h, exchangeId, "confirm");
  const result = await pending;

  assert.deepEqual(result, {
    pushed: true,
    commitSha: "new-commit",
    commitUrl: "https://github.com/octo/backups/commit/new-commit",
    repository: "octo/backups",
    branch: "main",
    folder: "demo-site",
    filesWritten: (planned.fileCount as number) + 1,
    totalBytes: result.totalBytes,
  });
  assert.deepEqual(h.github.unexpected, []);

  const pushCalls = h.github.calls.slice(callsAfterPlan).map((c) => `${c.method} ${new URL(c.url).pathname.replace(/^\/repos\/octo\/backups/, "")}`);
  const blobCount = pushCalls.filter((c) => c === "POST /git/blobs").length;
  assert.deepEqual(pushCalls, [
    "GET ",
    "GET /git/ref/heads/main",
    "GET /git/commits/tip-1",
    "GET /contents/demo-site",
    ...Array.from({ length: blobCount }, () => "POST /git/blobs"),
    "POST /git/trees",
    "POST /git/trees",
    "POST /git/commits",
    "PATCH /git/refs/heads/main",
  ]);
  assert.equal(blobCount, (planned.fileCount as number) + 1, "one blob per distinct file, plus the manifest");

  assert.deepEqual([...h.github.blobContents[0]!], DB_BYTES, "the database uploaded is the snapshot the plan captured");
  const manifest = JSON.parse(h.github.blobContents.at(-1)!.toString("utf8")) as { format: string; files: { path: string }[] };
  assert.equal(manifest.format, "tovu-site-backup", "the manifest is uploaded last");
  assert.equal(manifest.files.length, planned.fileCount);

  const writes = h.github.writes();
  const rootTree = JSON.parse(writes.at(-3)!.body ?? "{}") as { base_tree: string };
  assert.equal(rootTree.base_tree, "tree-of-tip-1", "everything outside the folder is kept");
  const commit = JSON.parse(writes.at(-2)!.body ?? "{}") as { parents: string[]; message: string };
  assert.deepEqual(commit.parents, ["tip-1"], "committed on the planned parent");
  assert.equal(commit.message, `Tovu site backup: Demo Site (${NOW})`);
  const ref = JSON.parse(writes.at(-1)!.body ?? "{}") as Record<string, unknown>;
  assert.equal("force" in ref, false, "never a force push");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
});

test("cancel pushes nothing, and the planId is spent", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const callsAfterPlan = h.github.calls.length;

  const { pending, exchangeId } = await raiseDialog(h, planId);
  answer(h, exchangeId, "cancel");

  assert.deepEqual(await pending, { pushed: false, cancelled: true });
  assert.equal(h.github.calls.length, callsAfterPlan, "a cancel costs no request");
  const again = (await call(h.pushTool, { planId }, { emitSurface: async () => undefined })) as Result;
  assert.equal(again.code, "PLAN_NOT_FOUND");
});

test("a planId works once: a second push with it is PLAN_NOT_FOUND and raises no dialog", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const first = await raiseDialog(h, planId);
  answer(h, first.exchangeId, "confirm");
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

  const { pending, exchangeId } = await raiseDialog(h, planId);
  answer(h, exchangeId, "cancel");
  assert.deepEqual(await pending, { pushed: false, cancelled: true });
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

test("a push with no confirmation channel is refused without using up the plan", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);

  const err = await rejection(call(h.pushTool, { planId }));
  assert.match(err.message, /no interactive confirmation channel/);

  const { pending, exchangeId } = await raiseDialog(h, planId);
  answer(h, exchangeId, "cancel");
  await pending;
});

test("a repository made public between plan and confirm is refused at push time, before any write", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const { pending, exchangeId } = await raiseDialog(h, planId);

  h.github.state.visibility = "public";
  answer(h, exchangeId, "confirm");
  const result = await pending;

  assert.equal(result.pushed, false);
  assert.equal(result.code, "REPOSITORY_NOT_PRIVATE");
  assert.deepEqual(h.github.writes(), []);
});

test("a branch that moved since the plan is DIVERGED_BRANCH, before a single blob is uploaded", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const { pending, exchangeId } = await raiseDialog(h, planId);

  h.github.state.tip = "tip-2";
  answer(h, exchangeId, "confirm");
  const result = await pending;

  assert.equal(result.code, "DIVERGED_BRANCH");
  assert.match(result.message as string, /moved since the backup was planned.*Nothing was written/);
  assert.deepEqual(h.github.writes(), []);
});

test("a branch that moves during the push (GitHub 422 on the ref update) is DIVERGED_BRANCH, with exactly one non-force attempt", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const { pending, exchangeId } = await raiseDialog(h, planId);

  h.github.state.patchStatus = 422;
  answer(h, exchangeId, "confirm");
  const result = await pending;

  assert.equal(result.code, "DIVERGED_BRANCH");
  assert.equal(h.github.calls.filter((c) => c.method === "PATCH").length, 1);
});

test("a file changed on disk since the plan is PLAN_STALE, and no tree, commit or ref update is made", async (t) => {
  const h = harness(t);
  await h.seed();
  const planId = await plannedId(h);
  const { pending, exchangeId } = await raiseDialog(h, planId);

  writeFileSync(path.join(h.site.root, "themes", "static", "demo", "index.html"), "<html>changed after the plan</html>");
  answer(h, exchangeId, "confirm");
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
      open: (input) => (broken ? Promise.reject(new Error("LEAK-SENTINEL")) : sealedWith.open(input)),
    }),
  });
  await h.seed();
  const planId = await plannedId(h);
  const { pending, exchangeId } = await raiseDialog(h, planId);

  broken = true;
  answer(h, exchangeId, "confirm");
  const result = await pending;

  assert.equal(result.code, "CREDENTIAL_UNREADABLE");
  assert.doesNotMatch(JSON.stringify(result), /LEAK-SENTINEL/);
  assert.deepEqual(h.github.writes(), []);
});
