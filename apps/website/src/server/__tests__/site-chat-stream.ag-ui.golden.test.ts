import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";
import { EventSchemas } from "@ag-ui/core/schemas";
import { set as setLegacySetting } from "@jini-ai/core/settings";

import { setPublicAssistantSettings, setSiteAssistantCredential } from "../../assistant/index.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createSiteAssistantModule } from "../runtime/composition/modules/site-assistant.js";
import { startTestServer } from "./helpers/http-test-server.js";
import { startStubProviderServer, type StubProviderReply } from "./helpers/stub-provider-server.js";

/**
 * @file P6-T1.T: the frames the public site chat sends a client that negotiated AG-UI
 * (`Accept: text/event-stream; agui=1`) on the same `/chat` POST. Every frame is validated with the
 * official `@ag-ui/core` event schemas, and the bytes are pinned in this suite's own golden file.
 * The legacy wire keeps its own golden (`site-chat-stream.golden.test.ts`) for the one-release window.
 *
 * Regenerate with `UPDATE_GOLDEN=1` only in a commit that names the wire change it makes.
 */

const GOLDEN = fileURLToPath(new URL("./goldens/site-chat-stream.ag-ui.golden.json", import.meta.url));
const alwaysAllow = async () => ({ allowed: true, reason: "test" });
const AG_UI_ACCEPT = "text/event-stream; agui=1";

function text(reply: string): StubProviderReply {
  const payload = { candidates: [{ content: { role: "model", parts: [{ text: reply }] }, finishReason: "STOP", index: 0 }] };
  return { status: 200, body: `data: ${JSON.stringify(payload)}\n\n` };
}

/** An OpenAI-protocol reply. Used for whitespace-only output: the Google adapter itself reports a
 *  content-free turn as a provider error, so only this protocol reaches the route's no-reply check. */
function openAiText(reply: string): StubProviderReply {
  const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
  return { status: 200, body: frame({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: reply }, finish_reason: null }] })
    + frame({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "data: [DONE]\n\n" };
}

async function boot({ t, respond, provider }: { t: TestContext; respond: () => StubProviderReply; provider?: { provider: string; model: string } }) {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await setPublicAssistantSettings({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, authorize: alwaysAllow, principals: deps.principalRepo },
  { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  const providerUrl = await startStubProviderServer(t, respond);
  await setSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
  { workspaceId: deps.workspaceId, apiKey: "test-fake-key-not-real", model: "gemini-flash-latest", baseUrl: providerUrl, ...provider });
  const app = express();
  app.use(express.json());
  createSiteAssistantModule(deps, { env: { ...process.env, GEMINI_API_KEY: "test-fake-key-not-real", TOVU_SITE_ASSISTANT_BASE_URL: providerUrl } }).registerRoutes?.({ app });
  return { baseUrl: await startTestServer(app, t) };
}

function chat(baseUrl: string): Promise<Response> {
  return fetch(`${baseUrl}/api/site-assistant/chat`, { method: "POST", headers: { "content-type": "application/json", accept: AG_UI_ACCEPT },
    body: JSON.stringify({ threadId: "thread-1", runId: "run-1", state: null, tools: [], context: [],
      messages: [{ id: "m1", role: "user", content: "List the categories." }], forwardedProps: { turnId: "turn-ag-ui-0001" } }) });
}

/** Every `data:` frame, parsed and validated against the official AG-UI event schemas. */
function officialEvents(body: string): { type: string }[] {
  return [...body.matchAll(/^data: (.+)$/gm)].map((match) => {
    const parsed = EventSchemas.safeParse(JSON.parse(match[1]!));
    assert.ok(parsed.success, `not an official AG-UI event: ${match[1]}`);
    return parsed.data as { type: string };
  });
}

function pin(raw: string): string {
  return raw.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>").replace(/\(error [^)]+\)/g, "(error <id>)");
}

function pinnedHeaders(response: Response): [string, string][] {
  return [...response.headers].filter(([name]) => name !== "date" && name !== "set-cookie").sort(([a], [b]) => a.localeCompare(b));
}

const actual: Record<string, unknown> = {};

function check(name: string, value: unknown): void {
  actual[name] = value;
  if (process.env.UPDATE_GOLDEN === "1") return;
  const golden = (JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, unknown>)[name];
  assert.deepEqual(value, golden, `site chat AG-UI golden "${name}"`);
}

test("a visitor turn emits RUN_STARTED, text start, delta, end, and RUN_FINISHED", async (t) => {
  const { baseUrl } = await boot({ t, respond: () => text("Hello from the site.") });
  const response = await chat(baseUrl);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(officialEvents(body).map((event) => event.type),
    ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]);
  assert.doesNotMatch(body, /^event: /m, "no legacy named events on the AG-UI wire");
  check("plain reply", { status: response.status, headers: pinnedHeaders(response), body: pin(body) });
});

test("a no-reply visitor turn ends once with a plain error", async (t) => {
  const { baseUrl } = await boot({ t, respond: () => openAiText("  \n "), provider: { provider: "openai", model: "gpt-x" } });
  const response = await chat(baseUrl);
  const body = await response.text();
  const types = officialEvents(body).map((event) => event.type);
  assert.deepEqual(types, ["RUN_STARTED", "RUN_ERROR"], "one RUN_ERROR, no success terminal, no empty message");
  const error = officialEvents(body).at(-1) as { message: string };
  // The widget renders this reason as its existing no-reply sentence (`site-assistant-errors.ts`).
  assert.equal(error.message, "the assistant sent no reply");
  check("no reply", { status: response.status, body: pin(body) });
});

test("the site chat AG-UI golden file holds exactly these scenarios", () => {
  if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(golden), ["plain reply", "no reply"]);
});
