import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import {
  setPublicAssistantSettings,
  setSiteAssistantCredential,
  deleteSiteAssistantCredential,
} from "../../assistant/index.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createSiteAssistantModule } from "../runtime/composition/modules/site-assistant.js";
import type { RouteDeps } from "../routes/types.js";
import { startTestServer } from "./helpers/http-test-server.js";
import { startStubProviderServer, type StubProviderReply, type StubProviderRequest } from "./helpers/stub-provider-server.js";

/**
 * @file `POST /api/site-assistant/chat` must call the provider the OPERATOR configured
 * (`site_assistant_credentials.provider`, written from the admin "Visitor's AI Assistant" tab), not
 * Google unconditionally.
 *
 * Separate from `site-assistant-routes.test.ts` — that file covers the enablement gate, the
 * rate limiter, and the tool/directive wire shapes, all of which are provider-independent. This one
 * covers exactly one property, and asserts it the only way it can actually be proven: by the
 * REQUEST TARGET the route dials. The four providers are distinguishable on the wire only by path
 * (Anthropic `/v1/messages`, OpenAI `/v1/chat/completions`, Google
 * `/v1beta/models/<model>:streamGenerateContent`), so a test that inspected only the outbound JSON
 * body — or only that the stored row was read — would pass against a route that reads `provider`
 * and then calls Google anyway. That is precisely the defect this file exists to pin.
 *
 * ## Why every test here stores a loopback `baseUrl` AND sets the env override
 *
 * Belt and braces, on purpose. The bug under test is "the stored credential's `baseUrl` is
 * dropped", so a RED run of these tests executes code that ignores the stored endpoint entirely;
 * without `TOVU_SITE_ASSISTANT_BASE_URL` also pointing at the stub, the RED run would issue REAL
 * requests to `generativelanguage.googleapis.com`. `site-assistant-routes.test.ts`'s own
 * `withoutGeminiApiKey` helper documents that exact accident happening once already. Both knobs
 * point at the same loopback stub, so no configuration of the route under test can escape it.
 *
 * Since t91 F3.1 (2026-09-16), `TOVU_SITE_ASSISTANT_BASE_URL`/`_MODEL` apply to `google` only
 * (`site-assistant.ts`'s `siteAssistantEnvFallbacks`) — `bootProviderStub`'s env override is now
 * only an escape guard for the `google` tests above; every non-Google test is held to the stub
 * exclusively by its own stored `baseUrl`, and the two "no stored endpoint" tests below prove
 * exactly that: a stored non-Google key with no stored `baseUrl`/`model` must reach the stub NOT AT
 * ALL, not merely reach it via the wrong knob.
 */

const alwaysAllow = async () => ({ allowed: true, reason: "test" });

/** A key-shaped string that is obviously not a credential, for every provider below. No test here
 *  reaches a real provider, and nothing asserts on the key's value — only that the request carrying
 *  it went to the right host. */
const FAKE_KEY = "test-fake-key-not-real";

/** Request targets, by provider, as each `@jini-ai/agent-runtime` adapter writes them. Substrings,
 *  not equality: Google appends the model and `?alt=sse`, Anthropic/OpenAI append nothing, and this
 *  file's property is "which provider", not "which exact query string". */
const ANTHROPIC_PATH = "/v1/messages";
const OPENAI_PATH = "/v1/chat/completions";
const GOOGLE_PATH_FRAGMENT = ":streamGenerateContent";

/** Real Anthropic `messages` SSE framing — same shape `runAnthropicToolTurn` parses, copied from
 *  `assistant-byok-routes.test.ts`'s identical helpers (which copied them from
 *  `@jini-ai/agent-runtime`'s own provider tests) rather than imported, for the reason that file
 *  states: a drift in either side's understanding of the wire shape should fail a test, not pass
 *  vacuously against a shape nothing real produces. */
function sseFrame(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
function anthropicReply(text: string): StubProviderReply {
  return {
    status: 200,
    body:
      sseFrame("message_start", {
        type: "message_start",
        message: { id: "msg_1", type: "message", role: "assistant", content: [], model: "claude-x", stop_reason: null, stop_sequence: null },
      }) +
      sseFrame("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
      sseFrame("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }) +
      sseFrame("content_block_stop", { type: "content_block_stop", index: 0 }) +
      sseFrame("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } }) +
      sseFrame("message_stop", { type: "message_stop" }),
  };
}

/** Real OpenAI `chat/completions` streaming framing, same provenance as {@link anthropicReply}. */
function openAiReply(text: string): StubProviderReply {
  const chunk = (payload: Record<string, unknown>): string => `data: ${JSON.stringify(payload)}\n\n`;
  return {
    status: 200,
    body:
      chunk({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }) +
      chunk({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) +
      "data: [DONE]\n\n",
  };
}

/** Real Gemini `streamGenerateContent` framing, same provenance as {@link anthropicReply}. */
function googleReply(text: string): StubProviderReply {
  return {
    status: 200,
    body: `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }] })}\n\n`,
  };
}

async function enablePublicAssistant(deps: RouteDeps): Promise<void> {
  // Await the LAST settings-registration promise in `createRouteDeps()`'s chain, not just the
  // assistant one — see `site-assistant-routes.test.ts`'s own note: `InMemorySettingsRepo.transaction`
  // is not reentrant, so awaiting earlier links races the later ones.
  await deps.siteTitleReady;
  await setPublicAssistantSettings(
    {
      settingsRepo: deps.settingsRepo,
      getEffective: deps.getEffective,
      set: deps.set,
      clock: deps.clock,
      ids: deps.idGen,
      authorize: alwaysAllow,
      principals: deps.principalRepo,
    },
    { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" },
  );
}

/** Writes the workspace's SITE credential exactly as the admin tab's save handlers do — `apiKey`
 *  through the real sealer/keyring, `provider`/`baseUrl`/`model` as plain columns. */
async function storeSiteCredential(
  deps: RouteDeps,
  input: { apiKey?: string; provider?: string; baseUrl?: string; model?: string },
): Promise<void> {
  await setSiteAssistantCredential(
    {
      repo: deps.siteAssistantCredentialRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      clock: deps.clock,
    },
    { workspaceId: deps.workspaceId, ...input },
  );
}

interface ProviderStub {
  readonly baseUrl: string;
  /** Every request target this stub received, in order. Empty means the route never called out. */
  readonly requests: StubProviderRequest[];
}

/**
 * Boots the site-assistant route against a real loopback stub standing in for the provider, and
 * records every request target it receives.
 *
 * Hand-assembles the app rather than using `createApp`, which always wires
 * `createSiteAssistantModule` against the real `process.env` — this needs an injected env so
 * neither the fake key nor the stub endpoint ever touches the process.
 */
async function bootProviderStub(
  t: import("node:test").TestContext,
  deps: RouteDeps,
  reply: (callCount: number) => StubProviderReply,
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<{ readonly siteUrl: string } & ProviderStub> {
  const requests: StubProviderRequest[] = [];
  const providerUrl = await startStubProviderServer(t, (callCount, _body, request) => {
    requests.push(request);
    return reply(callCount);
  });

  const testEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // See this file's header: the stub is the destination under BOTH the stored-endpoint path and
    // the env-override path, so a RED run cannot reach the real internet.
    TOVU_SITE_ASSISTANT_BASE_URL: providerUrl,
    ...envOverrides,
  };

  const app = express();
  app.use(express.json());
  createSiteAssistantModule(deps, testEnv).registerRoutes(app);
  const siteUrl = await startTestServer(app, t);
  return { siteUrl, baseUrl: providerUrl, requests };
}

async function postChat(siteUrl: string): Promise<Response> {
  return fetch(`${siteUrl}/api/site-assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "What posts are on this site?" }),
  });
}

/** Reads a response to completion, so a later assertion about what the route DID (which provider it
 *  called, or that it called none) is made after the route actually finished. A streamed refusal-free
 *  200 resolves `fetch` at `beginStream`, before any provider call — see the callers below. */
async function drainedBody(res: Response): Promise<{ status: number; text: string }> {
  return { status: res.status, text: await res.text() };
}

/** The concatenated `text` deltas a completed SSE response carried, so a test can assert the
 *  visitor actually received the provider's words. */
function sseTextOf(body: string): string {
  return body
    .split("\n\n")
    .filter((frame) => frame.startsWith("event: text\n"))
    .map((frame) => (JSON.parse(frame.slice(frame.indexOf("data: ") + "data: ".length)) as { delta: string }).delta)
    .join("");
}

test("site assistant: a stored ANTHROPIC credential sends the turn to Anthropic's endpoint, not Google's", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  const stub = await bootProviderStub(t, deps, () => anthropicReply("Hello from Anthropic."));
  await storeSiteCredential(deps, { apiKey: FAKE_KEY, provider: "anthropic", baseUrl: stub.baseUrl, model: "claude-x" });

  const res = await postChat(stub.siteUrl);
  assert.equal(res.status, 200);
  const body = await res.text();

  assert.equal(stub.requests.length, 1, `expected exactly one provider call, got ${stub.requests.length}`);
  assert.equal(
    stub.requests[0]?.url,
    ANTHROPIC_PATH,
    `a workspace configured for anthropic must post to ${ANTHROPIC_PATH}; got ${stub.requests[0]?.url}`,
  );
  assert.equal(sseTextOf(body), "Hello from Anthropic.");
});

test("site assistant: a stored OPENAI credential sends the turn to OpenAI's endpoint, not Google's", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  const stub = await bootProviderStub(t, deps, () => openAiReply("Hello from OpenAI."));
  await storeSiteCredential(deps, { apiKey: FAKE_KEY, provider: "openai", baseUrl: stub.baseUrl, model: "gpt-x" });

  const res = await postChat(stub.siteUrl);
  assert.equal(res.status, 200);
  const body = await res.text();

  assert.equal(stub.requests.length, 1, `expected exactly one provider call, got ${stub.requests.length}`);
  assert.equal(
    stub.requests[0]?.url,
    OPENAI_PATH,
    `a workspace configured for openai must post to ${OPENAI_PATH}; got ${stub.requests[0]?.url}`,
  );
  assert.equal(sseTextOf(body), "Hello from OpenAI.");
});

test("site assistant: a stored GOOGLE credential still reaches Gemini (no regression for the only provider that ever worked)", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  const stub = await bootProviderStub(t, deps, () => googleReply("Hello from Gemini."));
  await storeSiteCredential(deps, { apiKey: FAKE_KEY, provider: "google", baseUrl: stub.baseUrl, model: "gemini-flash-latest" });

  const res = await postChat(stub.siteUrl);
  assert.equal(res.status, 200);
  const body = await res.text();

  assert.equal(stub.requests.length, 1, `expected exactly one provider call, got ${stub.requests.length}`);
  assert.ok(
    stub.requests[0]?.url.includes(GOOGLE_PATH_FRAGMENT),
    `a workspace configured for google must post to a ${GOOGLE_PATH_FRAGMENT} target; got ${stub.requests[0]?.url}`,
  );
  assert.ok(
    stub.requests[0]?.url.includes("gemini-flash-latest"),
    `the stored model must reach the wire; got ${stub.requests[0]?.url}`,
  );
  assert.equal(sseTextOf(body), "Hello from Gemini.");
});

/**
 * The silent half of this bug, and the state this codebase reaches often: the operator switched the
 * tab to Anthropic and saved, but the key belongs to a different origin — here, the most common
 * case, the key was cleared (`deleteSiteAssistantCredential` keeps `provider` and drops only the
 * key, by design) while `GEMINI_API_KEY` is still set in the server environment.
 *
 * `GEMINI_API_KEY` is a GOOGLE key by name and by issuer. Spending it on a workspace that asked for
 * Anthropic answers a question nobody asked, and does it invisibly — the operator sees a working
 * assistant and concludes their Anthropic key is in use. The route must refuse and say why.
 */
test("site assistant: a workspace configured for anthropic with no anthropic key must NOT silently fall back to Google", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  const stub = await bootProviderStub(t, deps, () => googleReply("this must never be produced"), { GEMINI_API_KEY: FAKE_KEY });
  await storeSiteCredential(deps, { apiKey: FAKE_KEY, provider: "anthropic", baseUrl: stub.baseUrl, model: "claude-x" });
  await deleteSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, clock: deps.clock }, { workspaceId: deps.workspaceId });

  // Drained BEFORE the request-log assertion: a streamed 200 resolves `fetch` the moment
  // `beginStream` flushes headers, which on a RED run is well before the provider is called. A
  // `stub.requests` assertion made against an undrained response proves nothing.
  const raw = await drainedBody(await postChat(stub.siteUrl));

  assert.equal(stub.requests.length, 0, "no provider call may be made at all — least of all to Google with a Google key");
  assert.equal(raw.status, 503, `expected a 503 refusal, got ${raw.status} with body ${raw.text}`);
  const body = JSON.parse(raw.text) as { error?: string; code?: string };
  assert.equal(body.code, "NOT_CONFIGURED");
  assert.match(
    body.error ?? "",
    /anthropic/i,
    `the refusal must name the provider the workspace is actually configured for; got ${JSON.stringify(body.error)}`,
  );
});

/**
 * The same honesty rule one step earlier: a provider that IS configured and DOES have a key, but no
 * model. Google has a documented default (`gemini-flash-latest`); the others have none that is safe
 * to invent — a guessed model id buys an opaque provider 404 in place of a clear sentence.
 */
test("site assistant: a non-google provider with no model configured refuses with a reason instead of guessing one", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  const stub = await bootProviderStub(t, deps, () => anthropicReply("this must never be produced"));
  await storeSiteCredential(deps, { apiKey: FAKE_KEY, provider: "anthropic", baseUrl: stub.baseUrl, model: "" });

  const raw = await drainedBody(await postChat(stub.siteUrl));

  assert.equal(stub.requests.length, 0, "no provider call may be made without a model to call");
  assert.equal(raw.status, 503, `expected a 503 refusal, got ${raw.status} with body ${raw.text}`);
  const body = JSON.parse(raw.text) as { error?: string; code?: string };
  assert.equal(body.code, "MODEL_NOT_CONFIGURED");
  assert.match(body.error ?? "", /model/i);
});

/**
 * `site_assistant_credentials.provider` is a plain text column and `put-site-credential.ts` accepts
 * any string. An unrecognized value must be named, not quietly rounded to Google.
 */
test("site assistant: an unsupported stored provider refuses by name instead of falling through to Google", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  const stub = await bootProviderStub(t, deps, () => googleReply("this must never be produced"));
  await storeSiteCredential(deps, { apiKey: FAKE_KEY, provider: "cohere", baseUrl: stub.baseUrl, model: "command-r" });

  const raw = await drainedBody(await postChat(stub.siteUrl));

  assert.equal(stub.requests.length, 0, "an unsupported provider must not reach any provider at all");
  assert.equal(raw.status, 503, `expected a 503 refusal, got ${raw.status} with body ${raw.text}`);
  const body = JSON.parse(raw.text) as { error?: string; code?: string };
  assert.equal(body.code, "PROVIDER_UNSUPPORTED");
  assert.match(body.error ?? "", /cohere/);
});

/**
 * t91 F3.1: `TOVU_SITE_ASSISTANT_BASE_URL`/`_MODEL` are a Google-deployment escape hatch
 * (`googleEnvKey`'s sibling gate for the key already restricts THAT fallback to `protocol ===
 * "google"`), but until this fix `resolveBaseUrl`/`resolveModel` applied to every protocol. A
 * stored non-Google key with no stored endpoint/model would silently borrow the env values —
 * concretely, a stored Azure key with no stored `baseUrl` got posted, with its real key in the
 * `api-key` header, to whatever `TOVU_SITE_ASSISTANT_BASE_URL` pointed at (here, this file's own
 * loopback stub standing in for a Google-only deployment's endpoint).
 */
test("site assistant: a stored AZURE key with no stored endpoint is never sent to TOVU_SITE_ASSISTANT_BASE_URL (a Google-deployment setting)", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  const stub = await bootProviderStub(t, deps, () => openAiReply("this must never be produced"));
  await storeSiteCredential(deps, { apiKey: FAKE_KEY, provider: "azure", model: "tovu-deployment" });

  const raw = await drainedBody(await postChat(stub.siteUrl));

  assert.equal(stub.requests.length, 0, "the stored azure key must not reach the env endpoint");
  assert.equal(raw.status, 200, `expected a 200 stream carrying the turn error, got ${raw.status} with body ${raw.text}`);
  assert.match(
    raw.text,
    /the azure protocol requires a base URL/i,
    `expected the azure adapter's own missing-base-URL error, got ${raw.text}`,
  );
});

/**
 * The env `_MODEL` half of the same bug: a stored Anthropic key with no stored model must not
 * borrow `TOVU_SITE_ASSISTANT_MODEL` (also a Google-deployment setting), and — because
 * `resolveModel` is checked before `resolveBaseUrl` — must refuse before dialing anything, not
 * merely dial with the wrong model.
 */
test("site assistant: a stored ANTHROPIC key with no stored model or endpoint does not borrow TOVU_SITE_ASSISTANT_MODEL, and reaches no endpoint", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  const stub = await bootProviderStub(t, deps, () => anthropicReply("this must never be produced"), {
    TOVU_SITE_ASSISTANT_MODEL: "claude-x",
  });
  await storeSiteCredential(deps, { apiKey: FAKE_KEY, provider: "anthropic" });

  const raw = await drainedBody(await postChat(stub.siteUrl));

  assert.equal(stub.requests.length, 0, "no provider call may be made without a stored model");
  assert.equal(raw.status, 503, `expected a 503 refusal, got ${raw.status} with body ${raw.text}`);
  const body = JSON.parse(raw.text) as { error?: string; code?: string };
  assert.equal(body.code, "MODEL_NOT_CONFIGURED");
});
