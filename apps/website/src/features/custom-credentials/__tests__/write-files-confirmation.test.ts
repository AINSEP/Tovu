import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { SecretSealerPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import { createCustomCredential, type CustomCredentialWriteDeps } from "../store.js";
import { buildCustomCredentialsRegistrations, buildWriteFilesConfirmationFileSpecs, type CustomCredentialsToolDeps } from "../tool-registrations.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";

/**
 * @file Certification of `custom_credential_write_files`'s confirmation gate
 * (`tool-registrations.ts`, 2026-09-09) — mirrors `make-request-delete-confirmation.test.ts`'s own
 * mechanism (a real `SurfaceExchangeStore` plus `surfaceExchanges.deliver(...)` to simulate the
 * human's click, never a hand-rolled fake), adapted to this tool's own property: EVERY call is
 * gated, there is no un-confirmed verb the way GET/POST/PUT/PATCH are for
 * `custom_credential_make_request`.
 *
 * The property this file is responsible for: **a declined, expired, or abandoned write must never
 * reach `commitGitHubFiles` — no blob, tree, commit, or ref call is ever made.** The read-only
 * reconnaissance (`planGitHubFileWrite`'s branch/tree/existence lookups) DOES run before the dialog —
 * see this domain's own `tool-registrations.ts` header for why that is a deliberate, documented
 * choice, unlike DELETE's non-decrypting pre-check — so `TrackingSecretSealer` here asserts decrypt
 * COUNT (exactly once per call, for the plan phase), not decrypt AVOIDANCE.
 */

const WORKSPACE_ID = "ws-cred-write-files";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-09T00:00:00.000Z";
const TOOL_ID = "custom_credential_write_files";

class TrackingSecretSealer implements SecretSealerPort {
  sealCalls = 0;
  openCalls = 0;
  constructor(private readonly inner: SecretSealerPort) {}
  seal(input: Parameters<SecretSealerPort["seal"]>[0]): ReturnType<SecretSealerPort["seal"]> {
    this.sealCalls += 1;
    return this.inner.seal(input);
  }
  open(input: Parameters<SecretSealerPort["open"]>[0]): ReturnType<SecretSealerPort["open"]> {
    this.openCalls += 1;
    return this.inner.open(input);
  }
}

/** Sequential, order-verifying fake `HttpClientPort` — same discipline
 *  `github-write-files.unit.test.ts`'s own `SequentialFakeHttpClient` uses, kept local per this
 *  codebase's "each test file owns its own fixtures" convention. */
class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly steps: { match: RegExp; status: number; json?: unknown }[];

  constructor(steps: { match: RegExp; status: number; json?: unknown }[]) {
    this.steps = [...steps];
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const step = this.steps.shift();
    if (!step) throw new Error(`unexpected send() call (no more steps queued): ${request.method} ${request.url}`);
    if (!step.match.test(request.url)) throw new Error(`send() call ${request.method} ${request.url} did not match ${step.match}`);
    return { status: step.status, headers: {}, bodyText: JSON.stringify(step.json ?? {}) };
  }
}

/** The plan-phase steps every test in this file needs before the dialog can even be raised: one
 *  branch/tip lookup, one parent-commit lookup, and one existence check per file in `VALID_INPUT`. */
function planSteps() {
  return [
    { match: /\/git\/ref\/heads\/main$/, status: 200, json: { object: { sha: "parent-sha" } } },
    { match: /\/git\/commits\/parent-sha$/, status: 200, json: { tree: { sha: "base-tree-sha" } } },
    { match: /\/contents\?ref=main$/, status: 404, json: {} },
  ];
}

function fakeRouteDeps(options: { allow?: boolean; httpSteps?: { match: RegExp; status: number; json?: unknown }[] } = {}) {
  let allow = options.allow ?? true;
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new TrackingSecretSealer(new AesGcmSecretSealer(keyring));
  const httpClient = new FakeHttpClient(options.httpSteps ?? planSteps());

  const deps: CustomCredentialsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    customCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    idGen: (() => {
      let n = 0;
      return { newId: () => `deps-cred-${++n}` };
    })(),
    customCredentialsHttpClient: httpClient,
    authorize: async (params: Record<string, unknown>) => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
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

  return { deps, sealer, httpClient, writeDeps, setAllow: (value: boolean) => { allow = value; } };
}

async function seedGithub(writeDeps: CustomCredentialWriteDeps) {
  await createCustomCredential(writeDeps, {
    workspaceId: WORKSPACE_ID,
    label: "github",
    category: "source-control",
    baseUrl: "https://api.github.com",
    additionalHosts: [],
    connection: { token: "github-secret-token" },
  });
}

const VALID_INPUT = { label: "github", owner: "octo", repo: "demo", branch: "main", commitMessage: "deploy", files: [{ path: "fly.toml", content: "app = 'demo'" }] };

function buildRegistrations(deps: CustomCredentialsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildCustomCredentialsRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? VALID_INPUT,
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

async function raiseDialog(writeTool: ToolRegistration, input: unknown = VALID_INPUT) {
  const emitted: unknown[] = [];
  const pending = call(writeTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, ui, exchangeId };
}

// ---------------------------------------------------------------------------
// 1. The call plans (real reconnaissance), then parks — and nothing is committed yet
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and no blob/tree/commit/ref call is made while it is pending", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, ui, exchangeId } = await raiseDialog(writeTool);

  assert.equal(ui.type, "resource");
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers"
  );
  assert.equal(sealer.openCalls, 1, "the plan phase decrypts exactly once — see this file's header");
  assert.equal(httpClient.calls.length, 3, "only the 3 read-only plan calls (ref, parent-commit, existence check) — no blob/tree/commit/ref yet");
  for (const c of httpClient.calls) {
    assert.doesNotMatch(c.url, /\/git\/blobs$|\/git\/trees$|\/git\/commits$/, "no write call before confirmation");
  }

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names the credential, repository, branch, and the file's create/update state", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(writeTool);

  assert.match(ui.resource.text, /github/);
  assert.match(ui.resource.text, /octo\/demo/);
  assert.match(ui.resource.text, /main/);
  assert.match(ui.resource.text, /fly\.toml/);
  assert.match(ui.resource.text, /create/i);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("a file that already exists on the branch is labeled as an update, resolved from the real branch state", async () => {
  const { deps, writeDeps } = fakeRouteDeps({
    httpSteps: [
      { match: /\/git\/ref\/heads\/main$/, status: 200, json: { object: { sha: "parent-sha" } } },
      { match: /\/git\/commits\/parent-sha$/, status: 200, json: { tree: { sha: "base-tree-sha" } } },
      // A directory listing (an ARRAY of `{name, type}` entries) is what GitHub's real Contents API
      // answers here, and `github-write-files.ts`'s existence check matches `fly.toml` against
      // `entry.name` in it (5716426c/S21 — a directory or submodule at the path must NOT be
      // described as an update). Without a `type: "file"` entry this fixture exercises the refusal
      // path, not the update path this test is about.
      { match: /\/contents\?ref=main$/, status: 200, json: [{ name: "fly.toml", type: "file" }] },
    ],
  });
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(writeTool);
  assert.match(ui.resource.text, /update/i);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("a .github/workflows/** file gets an extra, distinctly-worded warning naming that exact path", async () => {
  const { deps, writeDeps } = fakeRouteDeps({
    httpSteps: [
      { match: /\/git\/ref\/heads\/main$/, status: 200, json: { object: { sha: "parent-sha" } } },
      { match: /\/git\/commits\/parent-sha$/, status: 200, json: { tree: { sha: "base-tree-sha" } } },
      { match: /\/contents\/\.github\/workflows\?ref=main$/, status: 404, json: {} },
    ],
  });
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);
  const input = { ...VALID_INPUT, files: [{ path: ".github/workflows/deploy.yml", content: "name: deploy" }] };

  const { ui, exchangeId, pending } = await raiseDialog(writeTool, input);

  assert.match(ui.resource.text, /WORKFLOW/);
  assert.match(ui.resource.text, /\.github\/workflows\/deploy\.yml/);
  assert.match(ui.resource.text, /runs? automatically|every future push/i);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("an ordinary file (no workflow path) never renders the workflow warning", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(writeTool);
  assert.doesNotMatch(ui.resource.text, /WORKFLOW FILE/);

  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 1b. The excerpt — what the human is told each file CONTAINS
//
// The dialog's own warning tells the human to "review its contents carefully", so the contents have
// to be in it. These pin the three ways that can go wrong: showing nothing, showing the whole file
// (an unbounded payload), and showing content the frame would execute rather than display.
// ---------------------------------------------------------------------------

/** Mirrors `tool-registrations.ts`'s own `WRITE_FILES_EXCERPT_MAX_CHARS`. Restated rather than
 *  imported: a test that reads the cap off the module under test would pass at any cap, including a
 *  silently-raised one that puts a whole file in the dialog payload. */
const EXCERPT_MAX_CHARS = 200;

/** Raises the dialog for a single `fly.toml` carrying `content`, returns the surface's rendered HTML,
 *  and settles the parked call so no test leaves a live exchange behind. */
async function dialogHtmlForContent(content: string): Promise<string> {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(writeTool, { ...VALID_INPUT, files: [{ path: "fly.toml", content }] });
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
  return ui.resource.text;
}

test("the dialog shows the file's real content and its byte size, not just its path", async () => {
  const html = await dialogHtmlForContent('app = "demo"\nprimary_region = "iad"');

  assert.match(html, /primary_region/, "the dialog asks the human to review the contents, so the contents must be in it");
  assert.match(html, /35 bytes/, "the size is the fact that tells a human a 'small config change' is actually not one");
});

test(`content of exactly ${EXCERPT_MAX_CHARS} characters is shown whole, with no ellipsis`, async () => {
  const html = await dialogHtmlForContent("x".repeat(EXCERPT_MAX_CHARS));

  assert.match(html, new RegExp(`x{${EXCERPT_MAX_CHARS}}`));
  assert.doesNotMatch(html, /x…/, "an off-by-one cap would claim a complete file was truncated");
});

test(`content over ${EXCERPT_MAX_CHARS} characters is cut to the cap plus an ellipsis, and the tail never travels in the dialog`, async () => {
  const html = await dialogHtmlForContent(`${"x".repeat(EXCERPT_MAX_CHARS)}TAIL_BEYOND_THE_CAP`);

  assert.match(html, new RegExp(`x{${EXCERPT_MAX_CHARS}}…`));
  assert.doesNotMatch(html, new RegExp(`x{${EXCERPT_MAX_CHARS + 1}}`), "the cap is a cap, not a hint");
  assert.doesNotMatch(html, /TAIL_BEYOND_THE_CAP/, "an uncapped excerpt would put whole megabyte files into the emitted surface");
});

test("a file whose content is genuinely empty says so", async () => {
  const html = await dialogHtmlForContent("");

  assert.match(html, /\(empty file\)/);
});

test("HTML in a file's content is escaped into the dialog, never rendered as live markup", async () => {
  const html = await dialogHtmlForContent("<script>alert(1)</script>");

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, "@jini-ai/ui's renderDetailList escapes every detail value — this pins that it still does");
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/, "an unescaped excerpt would execute inside the confirmation frame the human is about to click");
});

test("a planned path with no validated content throws — the dialog never calls a file about to be written '(empty file)'", () => {
  assert.throws(
    () =>
      buildWriteFilesConfirmationFileSpecs({
        fileStates: [{ path: "fly.toml", exists: false }],
        files: [{ path: "somewhere/else.toml", content: 'app = "demo"' }],
      }),
    /the write plan names 'fly\.toml'/
  );
});

test("each planned path is paired with its OWN content, matched by path rather than by position", () => {
  const specs = buildWriteFilesConfirmationFileSpecs({
    fileStates: [
      { path: "a.txt", exists: false },
      { path: ".github/workflows/deploy.yml", exists: true },
    ],
    files: [
      { path: ".github/workflows/deploy.yml", content: "name: deploy" },
      { path: "a.txt", content: "hello" },
    ],
  });

  assert.deepEqual(specs, [
    { path: "a.txt", exists: false, isWorkflow: false, contentExcerpt: "hello", sizeBytes: 5 },
    { path: ".github/workflows/deploy.yml", exists: true, isWorkflow: true, contentExcerpt: "name: deploy", sizeBytes: 12 },
  ]);
});

// ---------------------------------------------------------------------------
// 2. The model's own schema cannot complete the write on its own
// ---------------------------------------------------------------------------

test("the model's own schema publishes only label/owner/repo/branch/commitMessage/files — no decision or exchange-id field", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const schema = writeTool.descriptor.inputSchema as { properties: object; additionalProperties?: boolean };
  assert.deepEqual(Object.keys(schema.properties).sort(), ["branch", "commitMessage", "files", "label", "owner", "repo"]);
  assert.equal(schema.additionalProperties, false);
});

// ---------------------------------------------------------------------------
// 3. Confirm, cancel, and the two no-answer outcomes
// ---------------------------------------------------------------------------

test("confirm: the human's click performs the real write (blob, tree, commit, ref) and the SAME call reports it", async () => {
  const { deps, httpClient, writeDeps } = fakeRouteDeps({
    httpSteps: [
      ...planSteps(),
      { match: /\/git\/blobs$/, status: 201, json: { sha: "blob-sha" } },
      { match: /\/git\/trees$/, status: 201, json: { sha: "new-tree-sha" } },
      { match: /\/git\/commits$/, status: 201, json: { sha: "new-commit-sha" } },
      { match: /\/git\/refs\/heads\/main$/, status: 200, json: {} },
    ],
  });
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId } = await raiseDialog(writeTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  const result = await pending;

  assert.deepEqual(result, { executed: true, commitSha: "new-commit-sha", commitUrl: "https://github.com/octo/demo/commit/new-commit-sha", filesWritten: 1 });
  assert.ok(httpClient.calls.some((c) => c.url.endsWith("/git/blobs")));
  assert.ok(httpClient.calls.some((c) => c.url.endsWith("/git/trees")));
  assert.ok(httpClient.calls.some((c) => c.url.endsWith("/git/commits")));
  assert.ok(httpClient.calls.some((c) => c.url.endsWith("/git/refs/heads/main")));
});

test("decline: no blob/tree/commit/ref call is ever made, and the tool reports cancelled", async () => {
  const { deps, httpClient, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const { pending, exchangeId } = await raiseDialog(writeTool);
  const callsBeforeDecision = httpClient.calls.length;
  surfaceExchanges.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  const result = await pending;

  assert.deepEqual(result, { executed: false, cancelled: true });
  assert.equal(httpClient.calls.length, callsBeforeDecision, "a decline must cost no additional network call");
});

test("an unanswered dialog expires and reports {executed:false, cancelled:false, reason:'expired'} — no write call is ever made", async () => {
  const { deps, httpClient, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  const result = await call(writeTool, { emitSurface: async () => undefined });

  assert.deepEqual(result, { executed: false, cancelled: false, reason: "expired" });
  for (const c of httpClient.calls) {
    assert.doesNotMatch(c.url, /\/git\/blobs$|\/git\/trees$|\/git\/commits$|\/git\/refs\//, "no write call before an answer arrives");
  }
});

test("a cancelled run abandons the dialog and reports {executed:false, cancelled:false, reason:'abandoned'} — no write call is ever made", async () => {
  const { deps, httpClient, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);
  const controller = new AbortController();

  const pending = call(writeTool, { emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surfaceExchanges.size(), 1);

  controller.abort();

  const result = await pending;
  assert.deepEqual(result, { executed: false, cancelled: false, reason: "abandoned" });
  assert.equal(surfaceExchanges.size(), 0);
  for (const c of httpClient.calls) {
    assert.doesNotMatch(c.url, /\/git\/blobs$|\/git\/trees$|\/git\/commits$|\/git\/refs\//, "no write call before an answer arrives");
  }
});

// ---------------------------------------------------------------------------
// 4. Pre-dialog refusals — never reach the confirmation, never decrypt
// ---------------------------------------------------------------------------

test("an invalid input (bad owner) is refused before any decrypt or network call, and no dialog is raised", async () => {
  const { deps, sealer, httpClient, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(writeTool, { input: { ...VALID_INPUT, owner: "-bad" } }));
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
  assert.equal(surfaceExchanges.size(), 0);
});

test("a caller-fixable validation refusal arrives as a ToolInputError carrying this tool's schema, not as a bare Error the daemon redacts to INTERNAL_ERROR", async () => {
  const { deps, writeDeps } = fakeRouteDeps();
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(
    () => call(writeTool, { input: { ...VALID_INPUT, files: [{ path: "../escape.txt", content: "x" }] } }),
    (error: unknown) => {
      // `CustomCredentialValidationError` extends plain Error, so an undecorated throw reaches
      // `@jini-ai/daemon`'s ToolExecutor as errorKind 'internal' and `@jini-ai/http-kit`'s
      // delegatedToolExecuteRoute SEC-005-redacts it to a bare INTERNAL_ERROR — stripping the one
      // thing the caller could act on. Same classification the two `makeCredentialedRequest` call
      // sites in this file already apply.
      assert.ok(error instanceof ToolInputError, `expected ToolInputError, got ${error instanceof Error ? error.constructor.name : String(error)}`);
      assert.match(error.message, /file path escapes the repository root/, "the caller must still learn WHICH rule refused the call");
      assert.match(error.message, /"commitMessage"/, "and the published schema, so one turn fixes the call instead of a guessing game");
      return true;
    }
  );
});

test("a branch that does not exist is refused before any dialog", async () => {
  const { deps, writeDeps } = fakeRouteDeps({ httpSteps: [{ match: /\/git\/ref\/heads\/main$/, status: 404, json: {} }] });
  await seedGithub(writeDeps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(writeTool));
  assert.equal(surfaceExchanges.size(), 0);
});

test("insufficient permission is refused before any decrypt or network call", async () => {
  const { deps, sealer, httpClient, writeDeps, setAllow } = fakeRouteDeps();
  await seedGithub(writeDeps);
  setAllow(false);
  const surfaceExchanges = createSurfaceExchangeStore();
  const writeTool = tool(buildRegistrations(deps, surfaceExchanges), TOOL_ID);

  await assert.rejects(() => call(writeTool));
  assert.equal(sealer.openCalls, 0);
  assert.equal(httpClient.calls.length, 0);
});
