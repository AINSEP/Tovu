import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { createContributionRegistry, createToolRegistry, isReadOnlyTool, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import { createByokToolSurface, type ByokToolSurfaceDeps } from "#src/assistant/byok-tool-surface";
import { encodeScreenshotTiles } from "../screenshot-image.js";
import { buildWebScreenshotRegistrations, contributeWebScreenshotTools, webScreenshotDerivedRisk, type WebScreenshotToolDeps } from "../tool-registrations.js";
import { createWebScreenshotService, WEB_SCREENSHOT_TOOL_ID, type PageCapturePort, type WebScreenshotPorts } from "../web-screenshot.js";

/**
 * @file `web_screenshot_page`'s registration: the permission gate, read-only classification, and the
 * image result surviving BOTH agent paths intact — the daemon's delegated-tool route (CLI agents over
 * MCP) and the BYOK tool surface (provider image parts) — with a fake capture port.
 */

const WORKSPACE_ID = "ws-web-screenshot";
const PRINCIPAL_ID = "principal-web-screenshot";

async function fakePorts(): Promise<WebScreenshotPorts> {
  const png = await sharp({ create: { width: 1280, height: 800, channels: 3, background: { r: 0, g: 128, b: 0 } } }).png().toBuffer();
  const capture: PageCapturePort = {
    capture: async ({ url, viewport }) => ({ png, finalUrl: url, status: 200, title: "Fake", pageHeight: viewport.height, capturedHeight: viewport.height, blockedRequests: 0 }),
    close: async () => {},
  };
  return { capture, encodeTiles: encodeScreenshotTiles, nowMs: () => 0 };
}

function deps(checked: string[], allowed = true): WebScreenshotToolDeps {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async (request) => {
      checked.push(request.permission);
      return allowed ? { allowed: true, reason: "matched" as const } : { allowed: false, reason: "insufficient_permission" as const };
    },
  };
}

async function tool(checked: string[], allowed = true): Promise<ToolRegistration> {
  const service = createWebScreenshotService({ ports: await fakePorts() });
  const [registration] = buildWebScreenshotRegistrations({ routeDeps: deps(checked, allowed), service });
  return registration!;
}

function ctx(input: unknown): ToolExecutionContext {
  return { input, principal: { id: PRINCIPAL_ID }, runId: "run-1", toolUseId: "tu-1" } as unknown as ToolExecutionContext;
}

type Block = { type: string; mimeType?: string; data?: string; text?: string };
const blocksOf = (output: unknown) => (output as { content: Block[] }).content;

test("it is gated on admin.assistant.use, and a denied principal gets ForbiddenError before any capture", async () => {
  const checked: string[] = [];
  await assert.rejects((await tool(checked, false)).handler(ctx({ url: "https://example.com/" })), ForbiddenError);
  assert.deepEqual(checked, ["admin.assistant.use"]);
});

test("it is registered read-only with no side effects", async () => {
  const registration = await tool([]);
  assert.equal(registration.descriptor.id, WEB_SCREENSHOT_TOOL_ID);
  assert.equal(isReadOnlyTool({ descriptor: registration.descriptor }), true);
  assert.equal(webScreenshotDerivedRisk.get(WEB_SCREENSHOT_TOOL_ID), "none");
});

test("sitePath is refused when the host gave no own-site opener", async () => {
  await assert.rejects((await tool([])).handler(ctx({ sitePath: "/" })), /cannot render this site's own pages here/);
});

test("CLI path: through the real ToolExecutor and the daemon's read-only delegated-tool route, the JPEG block survives intact", async () => {
  const registration = await tool([]);
  const direct = blocksOf(await registration.handler(ctx({ url: "https://example.com/" })));

  const registry = createToolRegistry({});
  registry.register(registration);
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-web-screenshot" });
  const routeDeps = { toolExecutor: createToolExecutor({ registry }), lifecycle, toolRegistry: registry, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
  const result = await delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: "tu-shot-1", toolId: WEB_SCREENSHOT_TOOL_ID, input: { url: "https://example.com/" }, requireReadOnly: true },
    deps: routeDeps as never,
  });

  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  if (!result.ok) return;
  const envelope = (result.value as { result: { status: string; output: unknown } }).result;
  assert.equal(envelope.status, "completed");
  const routed = blocksOf(envelope.output);
  assert.deepEqual(routed.map((block) => block.type), ["text", "image"]);
  assert.equal(routed[1]!.mimeType, "image/jpeg");
  assert.equal(routed[1]!.data, direct[1]!.data);
});

test("BYOK path: execute_delegated_tool hands the provider image content blocks, not a JSON string", async () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
  };
  contributions.contributors.register({ contribution: contributeWebScreenshotTools({ ports: await fakePorts() }) });
  const routeDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => 0, nowIso: () => "2026-10-08T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    outbox: { enqueue: async () => {} },
    seoDeps: { dispatch: async () => { throw new Error("SEO is outside this fixture"); } },
  } as unknown as ByokToolSurfaceDeps;
  const surface = createByokToolSurface(routeDeps, { installExtensions: false, contributions });
  const result = await surface.executeMetaTool({ id: PRINCIPAL_ID }, { id: "run-byok-shot" }, {
    name: "execute_delegated_tool",
    input: { toolId: WEB_SCREENSHOT_TOOL_ID, input: { url: "https://example.com/", viewport: "desktop" } },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result).slice(0, 300));
  assert.ok(Array.isArray(result.content), `expected content blocks; got ${typeof result.content}`);
  const blocks = result.content as Block[];
  assert.deepEqual(blocks.map((block) => block.type), ["text", "image"]);
  assert.equal(blocks[1]!.mimeType, "image/jpeg");
  assert.deepEqual([...Buffer.from(blocks[1]!.data!, "base64").subarray(0, 3)], [0xff, 0xd8, 0xff], "the data must be real JPEG bytes");
  assert.equal(JSON.parse(blocks[0]!.text!).viewport, "desktop");
});

test("the contributor hands each built registration its site's opener and capture writer: themeId reaches the opener, savedFiles comes back", async () => {
  const opened: Array<{ themeId?: string }> = [];
  const savedFor: unknown[] = [];
  const routeDeps = { ...deps([]), marker: "this-site" };
  const contributor = contributeWebScreenshotTools({ ports: await fakePorts() }, {
    openOwnSiteFor: () => async (_required = {}, optional = {}) => { opened.push(optional); return { origin: "http://127.0.0.1:1", close: async () => {} }; },
    saveCaptureFilesFor: (built) => { savedFor.push((built as unknown as { marker: string }).marker); return async ({ files }) => files.map((file) => `/sites/demo/.captures/${file.relPath}`); },
  });
  const [registration] = contributor.build(routeDeps as never, {} as never);
  const facts = JSON.parse(blocksOf(await registration!.handler(ctx({ sitePath: "/", themeId: "luvira-copy" })))[0]!.text!) as { themeId: string; savedFiles: string[] };
  assert.deepEqual(opened, [{ themeId: "luvira-copy" }]);
  assert.deepEqual(savedFor, ["this-site"], "the writer is built from the deps of the site being served");
  assert.equal(facts.themeId, "luvira-copy");
  assert.deepEqual(facts.savedFiles, ["/sites/demo/.captures/1970-01-01/000000-000-site-desktop-theme-luvira-copy.jpg"]);
});
