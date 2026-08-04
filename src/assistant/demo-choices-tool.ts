import { buildFormSurface, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import {
  buildDomainRegistrations,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import { buildUIToolResult } from "./mcp-ui";

/**
 * @file A development-only agent tool that renders a grouped-choice MCP-UI form, so the radio and
 * checklist controls can be exercised through the real chat pane rather than only in unit tests.
 *
 * ## Why this exists as a tool rather than a test page
 *
 * `content_post_delete` is currently the ONLY tool in this codebase that emits an MCP-UI surface,
 * and it emits a *confirmation* — the one surface shape that carries a secret and must never be
 * re-rendered casually. So there was no way to see a form surface in the product at all, which made
 * "does a radio group actually work in the chat pane" unanswerable without either building this or
 * pointing the delete dialog at something it is not for.
 *
 * The path it exercises is the real one, end to end and unmodified: the daemon's
 * `splitToolResultSurfaces` withholds the resource from the model, emits it as an `mcp-ui` run
 * event, `assistant-transport.ts` unwraps it, `McpUiSurfaceCard` mounts it, and the human's submit
 * travels back through `/api/admin/v1/mcp-ui/tool-calls`. Nothing about that path is stubbed here.
 *
 * ## Why it is gated, and why the gate is an env var rather than a build flag
 *
 * It is registered only when `TOVU_ENABLE_DEMO_TOOLS` is set. A demo tool on the shipped surface is
 * a tool a model can call in production for no reason, and every wired tool costs context in every
 * prompt. An env var rather than a build-time flag because the check has to be legible to
 * `buildAssistantToolRegistrations`'s own catalog-vs-handler consistency guard, which runs at daemon
 * boot on the real registration list — a stripped build would make the guard pass vacuously.
 *
 * ## It writes nothing, deliberately
 *
 * Both branches are pure. There is no state to corrupt by clicking Submit twice, and no confirmation
 * token, because there is nothing to confirm — the interesting property here is that the controls
 * READ BACK correctly (a radio as one string, a checklist as an array), not that a gate holds.
 * Keeping it side-effect-free is also what makes `sideEffects: "none"` honest rather than a
 * classification someone has to re-audit later.
 */

/** The tool id, shared by the catalog, the handler, and the surface's own callback target. */
export const DEMO_CHOICES_TOOL_ID = "assistant_demo_choices";

/** Set to any non-empty value to wire this tool. Absent in normal runs. */
const DEMO_TOOLS_ENV_VAR = "TOVU_ENABLE_DEMO_TOOLS";

/** Whether demo tools are wired in this process. Read at registration time, not per call. */
export function demoToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[DEMO_TOOLS_ENV_VAR];
  return typeof value === "string" && value.length > 0;
}

/** Mirrors each domain's own local catalog interface — see `features/post/agent-tools.ts:120`. */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

export const demoChoicesAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: DEMO_CHOICES_TOOL_ID,
    description:
      "Development only. Renders a sample MCP-UI form with a radio group and a multi-select checklist, so the grouped-choice controls can be exercised in a real chat pane. Call it with no arguments to show the form; the form itself calls back with the human's selections. Writes nothing.",
    sideEffects: "none",
    authorization: { permission: "admin.assistant.use" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        plan: { type: "string", description: "Set by the rendered form, never by the model." },
        extras: {
          type: "array",
          items: { type: "string" },
          description: "Set by the rendered form, never by the model. The checklist's selected values.",
        },
      },
    },
  },
];

/** This wiring layer's own risk classification — see the kit for why it is independent of the catalog. */
export const demoChoicesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> buildFormSurface / a string echo. No repo, no command gateway, no outbox, no bus.
  [DEMO_CHOICES_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = new Map(demoChoicesAgentToolCatalog.map((entry) => [entry.name, entry]));

/**
 * Builds the demo registration, or none at all when the env gate is unset.
 *
 * @returns A single registration, or an empty list — an empty slice is legal and is what keeps this
 * tool off the surface in a normal run.
 */
export function buildDemoChoicesRegistrations(): ToolRegistration[] {
  if (!demoToolsEnabled()) return [];

  const handlers: Record<string, ToolHandler> = {
    [DEMO_CHOICES_TOOL_ID]: async (ctx: Parameters<ToolHandler>[0]) => {
      const input = (ctx.input ?? {}) as Record<string, unknown>;
      const plan = typeof input["plan"] === "string" ? input["plan"] : undefined;
      const extras = Array.isArray(input["extras"]) ? (input["extras"] as string[]) : undefined;

      // ---- Second call: the form posted the human's answers back. Echo them. ----
      // `plan` is the discriminator rather than `extras`, because an empty checklist is a real
      // answer ("none of them") and would be indistinguishable from "not submitted yet" if it
      // decided this branch.
      if (plan !== undefined) {
        return {
          submitted: true,
          plan,
          extras: extras ?? [],
          // Read back in the Playwright check: proves the array survived the DOM -> params ->
          // JSON-RPC -> HTTP round trip as an array, not as a comma-joined string.
          extrasCount: (extras ?? []).length,
        };
      }

      // ---- First call: render the form. ----
      const ui = buildFormSurface({
        uri: `ui://tovu/demo-choices/${ctx.principal.id}` as UIResourceUri,
        title: "Which choice(s) do you want?",
        description: "A development sample exercising both grouped-choice controls.",
        submitLabel: "Submit choices",
        toolName: DEMO_CHOICES_TOOL_ID,
        fields: [
          {
            kind: "enum",
            name: "plan",
            label: "Pick one",
            presentation: "radio",
            required: true,
            options: [
              { value: "basic", label: "Basic" },
              { value: "pro", label: "Pro" },
              { value: "team", label: "Team" },
            ],
          },
          {
            kind: "multi-enum",
            name: "extras",
            label: "Which choice(s) do you want?",
            hint: "Pick any number, including none.",
            options: [
              { value: "analytics", label: "Analytics" },
              { value: "backups", label: "Backups" },
              { value: "support", label: "Priority support" },
            ],
          },
        ],
        cancel: { label: "Cancel" },
        app: { appName: "tovu-demo-choices", appVersion: "1" },
        preferredFrameSize: ["100%", "420px"],
      });

      return buildUIToolResult({
        modelText:
          "A sample choice form has been shown to the user. NOTHING HAS BEEN SUBMITTED. The user's " +
          "selections arrive only if they submit that form, which sends them itself. You cannot " +
          "fill it in yourself: tell the user the form is open and wait.",
        ui,
      });
    },
  };

  return buildDomainRegistrations({
    domain: "demo-choices",
    catalogModule: "assistant/demo-choices-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: demoChoicesDerivedRisk,
  });
}
