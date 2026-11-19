import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * @file Characterization pin (design 02, step 0): the three public visitor registrations `createApp`
 * performs (comments submit, analytics ingest, forms submit) are not pure literals — comments STARTS
 * salt resolution from the env + runtime mode + site-key keyring, and forms builds file storage with a
 * deferred free-space probe and a System-principal lookup. This pins what each registrar RECEIVES and
 * when the capabilities are built (once per `createApp`, never per request).
 *
 * The three registrar modules and the form-file-storage factory are wrapped (spies in front of the
 * real functions) before `app.js` is first loaded; nothing in `app.ts` is read as text.
 */

type Captured = { comments: Array<Record<string, any>>; analytics: Array<Record<string, any>>; forms: Array<Record<string, any>>; storage: Array<Record<string, any>> };
const captured: Captured = { comments: [], analytics: [], forms: [], storage: [] };

const commentsRoute = await import("../../../inbound/public-http/routes/site/comments-submit.js");
const analyticsRoute = await import("../../../inbound/public-http/routes/site/analytics-ingest.js");
const formsRoute = await import("../../../inbound/public-http/routes/site/forms-submit.js");
const formStorage = await import("../../../../features/forms/form-file-storage.js");

mock.module("../../../inbound/public-http/routes/site/comments-submit.js", { namedExports: { ...commentsRoute,
  registerCommentsSubmitRoute: (required: Parameters<typeof commentsRoute.registerCommentsSubmitRoute>[0], ...rest: never[]) => { captured.comments.push(required.deps); return (commentsRoute.registerCommentsSubmitRoute as Function)(required, ...rest); } } });
mock.module("../../../inbound/public-http/routes/site/analytics-ingest.js", { namedExports: { ...analyticsRoute,
  registerAnalyticsIngestRoute: (required: Parameters<typeof analyticsRoute.registerAnalyticsIngestRoute>[0], ...rest: never[]) => { captured.analytics.push(required.deps); return (analyticsRoute.registerAnalyticsIngestRoute as Function)(required, ...rest); } } });
mock.module("../../../inbound/public-http/routes/site/forms-submit.js", { namedExports: { ...formsRoute,
  registerFormsSubmitRoute: (required: Parameters<typeof formsRoute.registerFormsSubmitRoute>[0], ...rest: never[]) => { captured.forms.push(required.deps); return (formsRoute.registerFormsSubmitRoute as Function)(required, ...rest); } } });
mock.module("../../../../features/forms/form-file-storage.js", { namedExports: { ...formStorage,
  createFormFileStorage: (input: Record<string, any>, ...rest: never[]) => { captured.storage.push(input); return (formStorage.createFormFileStorage as Function)(input, ...rest); } } });

const { createApp, createRouteDeps } = await import("../app.js");

/** Sets (or clears, with `undefined`) COMMENTS_IP_SALT for one test and restores it afterwards. */
function withSaltEnv(t: { after: (fn: () => void) => void }, value: string | undefined): void {
  const previous = process.env.COMMENTS_IP_SALT;
  t.after(() => { if (previous === undefined) delete process.env.COMMENTS_IP_SALT; else process.env.COMMENTS_IP_SALT = previous; });
  if (value === undefined) delete process.env.COMMENTS_IP_SALT; else process.env.COMMENTS_IP_SALT = value;
}

type DeriveInput = { workspaceId: string; purpose: string; info: string };

/** A keyring that records every `derive` call; `saltCalls` keeps only the comments salt's own purpose
 * (other app modules derive from the same keyring for their own purposes). */
function recordingKeyring(): { saltCalls: DeriveInput[]; derive: (input: DeriveInput) => Promise<Uint8Array> } {
  const saltCalls: DeriveInput[] = [];
  return { saltCalls, derive: async (input) => {
    if (input.purpose === "comments-ip-hash-salt") saltCalls.push(input);
    return new Uint8Array([1, 2, 3, 4]);
  } };
}

/** Builds one app and returns what each registrar saw for THAT build only. */
function buildOne(deps: ReturnType<typeof createRouteDeps>) {
  const before = { c: captured.comments.length, a: captured.analytics.length, f: captured.forms.length, s: captured.storage.length };
  createApp(deps);
  return {
    comments: captured.comments.slice(before.c), analytics: captured.analytics.slice(before.a),
    forms: captured.forms.slice(before.f), storage: captured.storage.slice(before.s),
  };
}

test("each visitor registrar is called exactly once per createApp, in comments → analytics → forms order", () => {
  const seen = buildOne(createRouteDeps());
  assert.equal(seen.comments.length, 1);
  assert.equal(seen.analytics.length, 1);
  assert.equal(seen.forms.length, 1);
});

test("comments: the salt is resolved from the site-key keyring ONCE per createApp, not per request", async (t) => {
  withSaltEnv(t, undefined);
  const deps = createRouteDeps();
  const keyring = recordingKeyring();
  (deps as { siteAssistantSecretKeyring: unknown }).siteAssistantSecretKeyring = keyring;
  const { comments } = buildOne(deps);
  const salt = await comments[0]!.ipHashSalt;
  assert.equal(keyring.saltCalls.length, 1, "derive ran at construction");
  assert.deepEqual(keyring.saltCalls[0], { workspaceId: deps.workspaceId, purpose: "comments-ip-hash-salt", info: "v1" });
  assert.equal(salt, "01020304");
  assert.equal(await comments[0]!.ipHashSalt, salt, "the same resolved promise is reused");
  assert.equal(keyring.saltCalls.length, 1, "reading the salt again never re-derives");
  buildOne(deps);
  assert.equal(keyring.saltCalls.length, 2, "another createApp on the same deps resolves again (once per app)");
});

test("comments: an explicit COMMENTS_IP_SALT wins and the keyring is never asked", async (t) => {
  withSaltEnv(t, "pinned-by-operator");
  const deps = createRouteDeps();
  const keyring = recordingKeyring();
  (deps as { siteAssistantSecretKeyring: unknown }).siteAssistantSecretKeyring = keyring;
  const { comments } = buildOne(deps);
  assert.equal(await comments[0]!.ipHashSalt, "pinned-by-operator");
  assert.equal(keyring.saltCalls.length, 0);
});

test("comments: a rejecting keyring falls back to the dev constant outside production (existing behaviour, recorded)", async (t) => {
  withSaltEnv(t, undefined);
  const deps = createRouteDeps();
  (deps as { siteAssistantSecretKeyring: unknown }).siteAssistantSecretKeyring = { derive: async () => { throw new Error("no site key"); } };
  const { comments } = buildOne(deps);
  assert.equal(await comments[0]!.ipHashSalt, "dev-only-insecure-salt");
});

test("comments: host ports and shared visitor ports are the root's own objects", () => {
  const deps = createRouteDeps();
  const { comments } = buildOne(deps);
  const route = comments[0]!;
  assert.equal(route.idGen, deps.idGen);
  assert.equal(route.tracker, deps.tracker);
  assert.equal(route.workspaceId, deps.workspaceId);
  assert.equal(route.visitorAnalyticsProof, deps.visitorAnalyticsProof);
  assert.equal(route.providers, deps.commentsProviders);
  assert.equal(route.ingressPolicy, deps.commentIngressPolicy);
  assert.ok(route.rateLimiter, "a per-submission rate limiter is built from the settings repo");
});

test("analytics ingest: forwards the root's sink/config/ids and a single-workspace host resolver", async () => {
  const deps = createRouteDeps();
  const { analytics } = buildOne(deps);
  const route = analytics[0]!;
  assert.equal(route.sink, deps.analyticsSink);
  assert.equal(route.config, deps.analyticsConfig);
  assert.equal(route.ids, deps.idGen);
  assert.equal(route.clock, deps.clock);
  assert.equal(route.browserAnalytics, deps.browserAnalytics);
  assert.equal(await route.resolveWorkspaceForHost(), deps.workspaceId);
  assert.equal(route.analyticsSeed, process.env.ANALYTICS_ROOT_KEY_SEED ?? "dev-only-insecure-seed");
});

test("forms: submitForm carries the root's repos, bus, outbox, limiter and the attachment-space message", () => {
  const deps = createRouteDeps();
  const { forms } = buildOne(deps);
  const route = forms[0]!;
  assert.equal(route.workspaceId, deps.workspaceId);
  assert.equal(route.formSubmissionAttempts, deps.formSubmissionAttempts);
  const submit = route.submitForm;
  assert.equal(submit.definitionRepo, deps.formDefinitionRepo);
  assert.equal(submit.submissionRepo, deps.formSubmissionRepo);
  assert.equal(submit.outbox, deps.outbox);
  assert.equal(submit.bus, deps.bus);
  assert.equal(submit.rateLimiter, deps.formsRateLimiter);
  assert.equal(submit.crypto, globalThis.crypto);
  assert.equal(submit.uploadSpaceMessage, "This site has no room for another attachment. Your answers are kept below. Your form has not been sent.");
});

test("forms: readUploadFreeBytes answers undefined for remote media WITHOUT probing the disk; otherwise it probes it", async () => {
  const remote = createRouteDeps();
  (remote as { siteBackupSources?: unknown }).siteBackupSources = { isMediaRemote: async () => true };
  remote.siteStoragePaths = { ...remote.siteStoragePaths, mediaUploadsDir: "/nonexistent/tovu-pin/uploads" };
  const remoteForm = buildOne(remote).forms[0]!.submitForm;
  assert.equal(await remoteForm.readUploadFreeBytes(), undefined, "remote media: no statfs (the dir does not exist, a probe would reject)");

  const local = createRouteDeps();
  (local as { siteBackupSources?: unknown }).siteBackupSources = { isMediaRemote: async () => false };
  local.siteStoragePaths = { ...local.siteStoragePaths, mediaUploadsDir: process.cwd() };
  const free = await buildOne(local).forms[0]!.submitForm.readUploadFreeBytes();
  assert.equal(typeof free, "number");
  assert.ok((free as number) > 0);

  const missing = createRouteDeps();
  missing.siteStoragePaths = { ...missing.siteStoragePaths, mediaUploadsDir: "/nonexistent/tovu-pin/uploads" };
  await assert.rejects(buildOne(missing).forms[0]!.submitForm.readUploadFreeBytes(), /ENOENT/, "local media with an unreadable dir surfaces statfs's error unchanged");
});

test("forms: file storage is built once per createApp; a missing System principal gives the exact upload error", async () => {
  const deps = createRouteDeps();
  const seen = buildOne(deps);
  assert.equal(seen.storage.length, 1, "createFormFileStorage ran once while the app was built");
  const storage = seen.storage[0]!;
  assert.equal(storage.contentTypes, deps.mediaContentTypeStore);
  assert.equal(storage.media.mediaRepo, deps.mediaRepo);
  assert.equal(storage.media.blobStore, deps.blobStore);
  assert.equal(storage.media.postRepo, deps.postRepo);
  const principal = await storage.resolveCreatedByPrincipal({ workspaceId: deps.workspaceId });
  const system = (await deps.principalRepo.list({ workspaceId: deps.workspaceId })).find((row) => row.kind === "system" && row.status === "active" && row.displayName === "System");
  assert.ok(system, "precondition: the seeded workspace has an active System principal");
  assert.equal(principal, system.id);

  const bare = createRouteDeps();
  const bareStorage = buildOne(bare).storage[0]!;
  await bare.identityReady;
  for (const row of await bare.principalRepo.list({ workspaceId: bare.workspaceId })) {
    if (row.kind === "system") await bare.principalRepo.save({ ...row, status: "disabled" } as typeof row);
  }
  await assert.rejects(bareStorage.resolveCreatedByPrincipal({ workspaceId: bare.workspaceId }), /form uploads require the site's System principal/);
});
