import { resolveSiteRoot } from "#src/platform/site-dir/index";
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { installAgentPlugin, recordBundledAgentPluginDigests } from "#src/features/agent-plugins/lifecycle";
import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { createRouteDeps } from "../../app.js";
import { createByokToolSurface } from "#src/assistant/index";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { BYOK_TURN_PATH, createAssistantByokModule } from "../assistant-byok.js";

/** TW2 L136: old validation order, attachment failures and fail-soft plugin preflight. */
test("BYOK pins history, credential and attachment validation before opening SSE", async t => {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantByokModule(deps, createByokToolSurface(deps, { installExtensions: false })).registerRoutes?.(app);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const messages = [{ role: "user", content: "Hello" }];
  const byok = { protocol: "anthropic", apiKey: "fixture-key", model: "fixture-model" };
  const cases = [
    { body: {}, error: "'messages' must end with a non-empty user message" },
    { body: { messages: [{ role: "assistant", content: "Hello" }] }, error: "'messages' must end with a non-empty user message" },
    { body: { messages, attachmentIds: false }, error: /no usable BYOK credential/ },
    ...[null, false, Array(11).fill("file"), [""], [7]].map(attachmentIds => ({ body: { messages, byok, attachmentIds }, error: "Invalid message attachments" })),
    { body: { messages, byok, attachmentIds: ["missing.png"] }, error: "Attachment is unavailable. Reattach it before sending." },
  ];
  for (const entry of cases) {
    const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(entry.body) });
    assert.equal(response.status, 400);
    const body = await response.json() as { error: string; code: string };
    assert.equal(body.code, "VALIDATION_ERROR");
    if (entry.error instanceof RegExp) assert.match(body.error, entry.error);
    else assert.equal(body.error, entry.error);
  }
});

test("BYOK pins absent and empty attachments, malformed plugin picks, and missing pinned plugins without discarding the provider turn", async t => {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantByokModule(deps, createByokToolSurface(deps, { installExtensions: false })).registerRoutes?.(app);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  let calls = 0;
  const providerUrl = await startStubProviderServer(t, () => {
    calls++;
    return { status: 200, body: 'event: message_start\ndata: {"type":"message_start","message":{"id":"reply","role":"assistant","content":[],"model":"fixture","usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n' };
  });
  for (const extra of [{}, { attachmentIds: [], pluginRefIds: 7 }, { pluginRefIds: [7, "missing-plugin"], conversationId: "pin-chat", userPrompt: "Hello" }, { conversationId: "fallback-query" }]) {
    const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
      messages: [{ role: "user", content: "Hello" }], byok: { protocol: "anthropic", apiKey: "fixture-key", model: "fixture", baseUrl: providerUrl }, ...extra,
    }) });
    assert.equal(response.status, 200);
    const stream = await response.text();
    assert.match(stream, /event: end/);
    assert.doesNotMatch(stream, /event: error/);
    assert.equal(stream.includes("Some selected Agent Plugins could not be loaded"), Array.isArray(extra.pluginRefIds));
  }
  assert.equal(calls, 4);
});


test("BYOK repeats pinned guidance while retaining good picks around failures (reported, not fixed)", async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), "byok-pin-"));
  t.after(() => forceRemove(cwd));
  const layout = resolveAgentPluginLayout({ siteDir: resolveSiteRoot({ env: {}, cwd: cwd }) }, { env: {} });
  const deps = createRouteDeps();
  deps.agentPluginLayout = layout;
  const archive = new TextEncoder().encode("pin-plugin-fixture");
  const installed = await installAgentPlugin({ archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), layout, workspaceId: deps.workspaceId,
    archiveReader: { async *entries() {
      for (const [entryPath, content] of [
        ["plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "pin-guidance", version: "1.0.0", keywords: ["holography"], extensions: { tovu: { id: "test/pin-guidance", displayName: "Pin Holography", provides: ["theme-authoring"] } } })],
        ["skills/pin-guidance/SKILL.md", "---\nname: pin-guidance\ndescription: Holography guidance\n---\nPreserve the unique pin guidance."],
      ] as const) {
        const bytes = new TextEncoder().encode(content);
        yield { entryPath, kind: "file" as const, declaredSize: bytes.length, async *openReadStream() { yield bytes; } };
      }
    } },
  });
  await recordBundledAgentPluginDigests({ workspaceRoot: layout.forWorkspace(deps.workspaceId).root, seeded: [{ pluginId: installed.pluginId, archiveDigest: installed.archiveDigest }] });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantByokModule(deps, createByokToolSurface(deps, { installExtensions: false })).registerRoutes?.(app);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const prompts: string[] = [];
  const providerUrl = await startStubProviderServer(t, (_count, body) => {
    prompts.push(String(body.system));
    return { status: 200, body: 'event: message_start\ndata: {"type":"message_start","message":{"id":"reply","role":"assistant","content":[],"model":"fixture","usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n' };
  });
  const send = (extra: Record<string, unknown>) => fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
    messages: [{ role: "user", content: "Design holography" }], byok: { protocol: "anthropic", apiKey: "fixture-key", model: "fixture", baseUrl: providerUrl }, ...extra,
  }) });
  const response = await send({ pluginRefIds: [installed.pluginId, "missing-plugin", installed.pluginId] });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Some selected Agent Plugins could not be loaded/);
  assert.equal(prompts[0]?.split("Preserve the unique pin guidance.").length, 3);

  const automatic = await send({ conversationId: "automatic-pin", userPrompt: "Design holography" });
  assert.equal(automatic.status, 200);
  assert.doesNotMatch(await automatic.text(), /event: error/);
  assert.match(prompts[1]!, /Relevant agent plugins for this request:/);

  // Both explicit resolver throws and automatic preflight throws remain fail-soft.
  deps.agentPluginLayout = { ...layout, forWorkspace: () => { throw new Error("fixture plugin storage unavailable"); } };
  deps.getEffective = async () => { throw new Error("fixture automatic preflight unavailable"); };
  const failed = await send({ conversationId: "failed-pin", pluginRefIds: [installed.pluginId] });
  assert.equal(failed.status, 200);
  const stream = await failed.text();
  assert.match(stream, /Some selected Agent Plugins could not be loaded/);
  assert.doesNotMatch(stream, /event: error/);
  assert.doesNotMatch(prompts[2]!, /Preserve the unique pin guidance/);
});
