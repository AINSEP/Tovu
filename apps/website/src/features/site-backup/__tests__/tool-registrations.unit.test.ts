import { LEGACY_SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryCustomCredentialSetRepo } from "../../custom-credentials/repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../../custom-credentials/store.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { SiteBackupPlanStore } from "../plan-store.js";
import type { SiteBackupSources } from "../sources.js";
import { buildSiteBackupRegistrations, siteBackupAgentToolCatalog, type SiteBackupToolDeps } from "../tool-registrations.js";
import { githubFromSource } from "../../source-control/__tests__/fixtures/github-from-source.js";
import { FakeGitHub } from "./fixtures/fake-github.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

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
    [LEGACY_SITE_KEY_ENV_VAR_NAME]: process.env[LEGACY_SITE_KEY_ENV_VAR_NAME],
    TOVU_SITE_KEY: process.env.TOVU_SITE_KEY,
    TOVU_RUNTIME_MODE: process.env.TOVU_RUNTIME_MODE,
  };
  process.env.HOME = dir;
  delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
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
  siteKeyStatus?: () => { active: boolean; invalid?: boolean };
  /** When true, leaves `deps.siteBackupSiteKeyStatus` unset entirely (rather than this harness's own
   *  `{active: true}` stub) so the SUT's real default, site-aware status computation runs. */
  useDefaultSiteKeyStatus?: boolean;
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
    loadSourceControlProviders: githubFromSource,
    dbOps,
    ...(options.withoutSources ? {} : { siteBackupSources: site.sources }),
    siteBackupPlanStore: planStore,
    ...(options.useDefaultSiteKeyStatus ? {} : { siteBackupSiteKeyStatus: options.siteKeyStatus ?? (() => ({ active: true })) }),
    siteBackupFailureLog: (line) => logLines.push(line),
    siteBackupNow: () => new Date(NOW),
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
async function beginCall(h: ReturnType<typeof harness>, planId: string, principalId = OWNER_PRINCIPAL, signal?: AbortSignal) {
  return {pending: call(h.pushTool, {planId}, {principalId, signal}) as Promise<Result>};
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

test("the push raises the dialog and touches GitHub not at all while it waits; confirm re-checks, then blobs -> 2 trees -> commit -> non-force ref update", async (t) => {
  const h = harness(t);
  h.github.files.set("demo-site/obsolete.txt", Buffer.from("Old backup file"));
  h.github.state.folderExists = true;
  await h.seed();
  const planned = await plan(h);
  const callsAfterPlan = h.github.calls.length;

  const { pending } = await beginCall(h, planned.planId as string);

  const result = await pending;

  assert.deepEqual(result, {
    pushed: true,
    commitSha: "new-commit",
    commitUrl: "https://github.com/octo/backups/commit/new-commit",
    repository: "octo/backups",
    branch: "main",
    folder: "demo-site",
    filesWritten: (planned.fileCount as number) + 1,
    totalBytes: DB_BYTES.length + Buffer.byteLength('{"name":"Demo Site"}') + Buffer.byteLength('{"siteId":"s1"}') + Buffer.byteLength("IMG") + Buffer.byteLength("<html>") + Buffer.byteLength("# skill") + h.github.blobContents.at(-1)!.length,
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
  assert.deepEqual(JSON.parse(h.github.files.get("demo-site/tovu-backup.json")!.toString("utf8")), manifest);

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
      open: (input) => (broken ? Promise.reject(new Error("LEAK-SENTINEL")) : sealedWith.open(input)),
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
