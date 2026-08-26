/**
 * @file The site-evidence domain's agent-tool catalog — one tool, `site_collect_page_evidence`.
 *
 * **Why this is a native first-party tool and not part of the `site-compliance` Agent Plugin.**
 * Two independent reasons, both load-bearing:
 *
 * 1. An Agent Plugin's tool-bearing surface is its `mcp.json`'s `mcpServers`, and nothing in this
 *    codebase spawns one — `agent-plugins/capability-projection.ts` marks every MCP capability
 *    `execute: { kind: "unavailable" }` by construction, with no promotion path. A tool declared
 *    inside the plugin would be inert decoration.
 * 2. Observing what a published page actually renders is not a compliance-only need. SEO checks,
 *    theme QA, link checking, and "did my page actually deploy" all want the same evidence.
 *    Burying it in a compliance package would strand a general capability in one silo and make the
 *    model's tool-selection problem worse by adding a narrow verb where a general one belongs.
 *
 * **What this tool deliberately does not do.** It does not evaluate anything. There is no `pass`,
 * no `score`, no rule id, no severity. The description below says so to the model in as many words,
 * because a tool whose output looked like a verdict would make the compliance skill's own
 * "evidence, never a verdict" contract unenforceable — the verdict would already have been asserted
 * upstream of the reasoning that is supposed to be constrained.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "deletes-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

export const SITE_EVIDENCE_TOOL_ID = "site_collect_page_evidence";

export const siteEvidenceAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: SITE_EVIDENCE_TOOL_ID,
    description:
      "Loads pages of THIS site in a real headless browser and reports what was actually observed: " +
      "cookies set (names, domains, flags — never values), network requests attempted (method, host, " +
      "path, resource type, and whether they fired before or after a consent click), response headers, " +
      "the page title/lang/text, and the rendered accessibility structure (landmarks, heading outline, " +
      "image alt text, form-control label associations, and colour-contrast samples) — each with the CSS " +
      "selector it came from. Use it for anything a configuration snapshot cannot prove: whether a " +
      "tracking cookie fires before consent, whether a consent banner actually renders, whether a " +
      "privacy policy page is reachable or is still placeholder text, whether headings and labels are " +
      "really there in the published output. " +
      "SCOPE: this site's own origin only — it takes site-relative paths, never URLs, and will not " +
      "fetch another host. It loads at most 5 pages per call under a 60s budget, never submits a form " +
      "or any non-GET request, and persists nothing. " +
      "IT REPORTS EVIDENCE, NOT VERDICTS: there is no pass/fail, no score, and no compliance " +
      "assessment in the output, and the absence of an observation is never evidence that something " +
      "is absent — a page listed under 'skipped' was not inspected at all.",
    sideEffects: "none",
    authorization: { permission: "content.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["paths"],
      properties: {
        paths: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "string",
            description:
              "A site-relative path on THIS site, e.g. '/', '/pricing', '/legal/privacy'. Absolute URLs, " +
              "protocol-relative paths, and '..' segments are refused and reported in 'skipped'.",
          },
          description: "Up to 5 site-relative paths to load. Anything past the 5th is returned in 'skipped' with reason 'page-cap'.",
        },
        consentAcceptSelector: {
          type: "string",
          description:
            "Optional CSS selector for this site's own consent-accept control (ask the operator for it). " +
            "When given, the tool clicks it once after the first observation and marks everything seen " +
            "afterwards with phase 'after', which is the only way to tell gated behaviour from ungated. " +
            "When omitted, every observation is phase 'before' and nothing in the result says what " +
            "changes on acceptance.",
        },
        collectAccessibility: {
          type: "boolean",
          description:
            "Defaults to true. Set false to skip the rendered accessibility walk when only cookie/request " +
            "evidence is wanted — a context-size choice, not a faster page load.",
        },
      },
    },
  },
];
