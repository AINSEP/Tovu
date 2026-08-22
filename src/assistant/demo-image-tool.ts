import {
  buildDomainRegistrations,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import { demoToolsEnabled } from "./demo-choices-tool.js";
import { renderSolidColorPng, type RgbColor } from "./demo-image-png.js";

/**
 * @file A development-only agent tool that returns a real image as a typed content block, so the
 * typed-media path (daemon `tool_result.media` -> chat-core `AgentEvent` -> `ToolCard`'s inline
 * `<img>`) can be exercised through the real chat pane rather than only in unit tests — the same
 * shape of justification `demo-choices-tool.ts` and `demo-a2ui-tool.ts` already give for their own
 * transports, applied to this one (ADS-memory swarm-consensus 2026-08-22 capability-bucket debate:
 * "tool results must carry typed media rather than flattened text").
 *
 * ## Why a hand-rolled PNG rather than a real image-generation call
 *
 * The owner's real motivating case is an external MCP server (Higgsfield) generating an image from
 * a prompt. Wiring that here would pull in network I/O, an API key, and a whole credential story —
 * none of which this slice is about proving. What has to be proven is the TRANSPORT: that a block
 * shaped `{type:'image', mimeType, data}` in a tool's return value actually reaches the chat pane as
 * a real `<img>`. `demo-image-png.ts`'s hand-rolled encoder produces a genuinely decodable PNG with
 * zero new dependencies and zero network calls, which is what makes this the cheapest HONEST proof
 * available — not a stub that merely LOOKS like an image block.
 *
 * ## Why it is gated, and why the gate is an env var
 *
 * Same reasoning as `demo-choices-tool.ts`'s own header, word for word: registered only when
 * `TOVU_ENABLE_DEMO_TOOLS` is set, so a demo tool never costs context in a production prompt, and an
 * env var rather than a build flag keeps the check legible to `buildAssistantToolRegistrations`'s
 * catalog-vs-handler consistency guard at daemon boot.
 *
 * ## It writes nothing, and needs no `emitSurface`
 *
 * Unlike `demo-choices-tool.ts` (which parks on a human answer via MCP-UI), this tool is a single
 * synchronous computation with no side effect and nothing to wait on — the entire point of THIS
 * demo is that the media reaches the model's tool result and the chat pane in the SAME call that
 * returns it, no held-open exchange required.
 */

/** The tool id, shared by the catalog and the handler. */
export const DEMO_IMAGE_TOOL_ID = "assistant_demo_image";

/** The fixed swatch color every call renders — deliberately not model-controlled (see the
 *  `inputSchema` below: this tool takes no parameters), so its output is deterministic and its own
 *  test can assert exact pixel bytes without threading a color through the tool-call layer too. */
const SWATCH_COLOR: RgbColor = { r: 79, g: 70, b: 229 };

/** Mirrors each domain's own local catalog interface — see `demo-choices-tool.ts`'s identical field. */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

export const demoImageAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: DEMO_IMAGE_TOOL_ID,
    description:
      "Development only. Returns a generated 64x64 PNG color swatch as a typed image content block, so the chat pane's typed-media rendering (an image inline in a tool result) can be exercised for real. Call it with no arguments. Writes nothing.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
];

/** This wiring layer's own risk classification — see the kit for why it is independent of the catalog. */
export const demoImageDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> renderSolidColorPng, a pure in-memory computation. No repo, no command gateway, no outbox, no bus.
  [DEMO_IMAGE_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = new Map(demoImageAgentToolCatalog.map((entry) => [entry.name, entry]));

/**
 * Builds the demo registration, or none at all when the env gate is unset.
 *
 * @param _routeDeps - Unused; this tool touches no domain dependency. Present because every domain
 * builder shares one signature (`tool-registrations.ts`'s `DomainSlice.build`).
 * @returns A single registration, or an empty list — an empty slice is legal and is what keeps this
 * tool off the surface in a normal run.
 */
export function buildDemoImageRegistrations(_routeDeps?: unknown): ToolRegistration[] {
  if (!demoToolsEnabled()) return [];

  const handlers: Record<string, ToolHandler> = {
    [DEMO_IMAGE_TOOL_ID]: async () => {
      const png = renderSolidColorPng({ color: SWATCH_COLOR });
      return {
        content: [
          { type: "text", text: "Generated a 64x64 PNG color swatch as a typed image block." },
          { type: "image", mimeType: "image/png", data: png.toString("base64") },
        ],
      };
    },
  };

  return buildDomainRegistrations({
    domain: "demo-image",
    catalogModule: "assistant/demo-image-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: demoImageDerivedRisk,
  });
}
