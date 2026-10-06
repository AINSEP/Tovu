/**
 * @file The tool set the desktop app's ONE chat agent always has (`desktop.*`), plus the two
 * `site.*` entry points through which it reaches the ACTIVE site's own tools.
 *
 * Owner design (2026-10-06, SPEC-051 Addendum 4): one agent for the whole app, never one per site.
 * It always has the desktop tools; when a site is on screen at the moment a turn starts, that site's
 * tools are offered too, "like its own" — and only that one site's, never every open site's.
 *
 * Two deliberate shapes here:
 *
 * - **The desktop tools are the SAME table the per-site MCP server publishes** (`sites-mcp-tools.ts`),
 *   adapted rather than re-declared. One table, two transports: a desktop verb added there reaches
 *   both the site assistants that federate it and this app-level agent, with one description that
 *   cannot drift between the two.
 *
 * - **The site tools are reached through a per-run addressee, not a mutable "current site".** The
 *   Jini `ToolRegistry` is process-wide and static, and its catalog has no notion of a run, so a
 *   site's tool list cannot be swapped in and out of it per turn without racing a concurrent turn.
 *   Instead `site.list_tools`/`site.call_tool` resolve the site the RUN was started against
 *   (`addresseeOf(runId)`, captured once at turn start — REQ-05). A tab switch mid-turn therefore
 *   cannot land a call on a different site's `content.db` than the one the turn began against — the
 *   same "no notion of the current site" rule `sites-mcp-tools.ts`'s own header states.
 */
import type { ToolExecutionContext, ToolPolicy, ToolRegistration } from "@jini-ai/core";
import { describeSitesMcpTools, runSitesMcpTool, type ToolContext } from "./sites-mcp-tools.ts";

/** Prefix every desktop verb carries in the agent's tool namespace. */
const DESKTOP_TOOL_PREFIX = "desktop.";

/** The turn's addressee, captured at turn start (REQ-05). `null` = no site on screen. */
interface TurnAddressee {
  siteDir: string;
  name: string;
}

/** One tool a site exposes to the app-level agent. Mirrors the site route's list payload. */
interface SiteToolSummary {
  id: string;
  description: string;
  inputSchema?: unknown;
}

/**
 * The port through which the app-level agent reaches ONE site's own tools. The site's own process
 * executes them against its own `content.db`; this side never runs a site tool itself.
 *
 * `available: false` is an answer, not an exception: an unreachable site (no inbound route yet,
 * daemon down, session expired) degrades the turn to `desktop.*` only and says so (REQ-19).
 */
interface SiteToolGateway {
  listTools(required: { siteDir: string }): Promise<{ available: true; tools: readonly SiteToolSummary[] } | { available: false; reason: string }>;
  callTool(required: { siteDir: string; toolId: string; input: unknown }): Promise<{ ok: true; output: unknown } | { ok: false; reason: string }>;
}

/** Ports {@link buildDesktopAgentTools} needs. */
interface DesktopAgentToolDeps {
  /** What the shared desktop table needs (`projectsPath`, `revealPath`, …). */
  sitesToolContext: ToolContext;
  /** The site a run was started against, or `null`. Read per call, keyed by run id. */
  addresseeOf: (runId: string) => TurnAddressee | null;
  siteTools: SiteToolGateway;
  /** Pushes `workspace:chat:navigate` to the shell renderer (REQ-17). */
  navigate: (required: { section: string }) => void;
}

/**
 * Every tool here is the local operator's own, reached only over loopback by a run this process
 * started — so the policy is allow. Destructive verbs (`desktop.project.delete`) are deliberately
 * NOT in this set until REQ-11's confirmation transport exists; that absence is the gate.
 */
const OPERATOR_POLICY: ToolPolicy = Object.freeze({ authorize: () => "allow" as const });

/** The navigable top-level sections (`contracts/sections.ts` ids the shell enables today). */
const NAVIGABLE_SECTIONS = Object.freeze(["projects", "marketplace"]);

/**
 * Adapts the shared desktop MCP table into Jini `ToolRegistration`s, one per row, ids prefixed
 * `desktop.`. The MCP result's text is what the model reads, so it is returned verbatim with the
 * structured payload alongside; an `isError` row stays a result (the model should read and correct),
 * matching `runSitesMcpTool`'s own "answers, not transport errors" rule.
 *
 * @complexity O(n) in the table size.
 */
function sharedDesktopTools(context: ToolContext): ToolRegistration[] {
  return describeSitesMcpTools().map(({ name, description, inputSchema, annotations }) => ({
    descriptor: {
      id: `${DESKTOP_TOOL_PREFIX}${name}`,
      description,
      inputSchema,
      readOnly: annotations.readOnlyHint === true,
    },
    policy: OPERATOR_POLICY,
    handler: async ({ input }: ToolExecutionContext) => {
      const result = await runSitesMcpTool(name, (input ?? {}) as Record<string, unknown>, context);
      return { text: result.content.map((part) => part.text).join("\n"), structured: result.structuredContent, isError: result.isError === true };
    },
  }));
}

/** `desktop.navigate` — moves the shell's top nav (REQ-17). @complexity O(1). */
function navigateTool(navigate: DesktopAgentToolDeps["navigate"]): ToolRegistration {
  return {
    descriptor: {
      id: `${DESKTOP_TOOL_PREFIX}navigate`,
      description: `Switch the Tovu desktop app's visible screen. section is one of: ${NAVIGABLE_SECTIONS.join(", ")}.`,
      inputSchema: { type: "object", properties: { section: { type: "string", enum: [...NAVIGABLE_SECTIONS] } }, required: ["section"], additionalProperties: false },
    },
    policy: OPERATOR_POLICY,
    handler: async ({ input }: ToolExecutionContext) => {
      const section = (input as { section?: unknown } | null)?.section;
      if (typeof section !== "string" || !NAVIGABLE_SECTIONS.includes(section)) {
        return { text: `Unknown section ${JSON.stringify(section)}. Use one of: ${NAVIGABLE_SECTIONS.join(", ")}.`, isError: true };
      }
      navigate({ section });
      return { text: `Switched to ${section}.` };
    },
  };
}

/** The refusal every `site.*` call gets on a turn that started with no site on screen. */
function noActiveSiteText(): string {
  return "No website was open on screen when this turn started, so no site tools are available. Ask the operator to open the website, then try again on the next message.";
}

/**
 * `site.list_tools` / `site.call_tool` — the active site's own tools, executed by that site.
 * @complexity O(1) here; the gateway's own cost on top.
 */
function activeSiteTools(deps: Pick<DesktopAgentToolDeps, "addresseeOf" | "siteTools">): ToolRegistration[] {
  return [
    {
      descriptor: {
        id: "site.list_tools",
        description: "List the tools of the website that was on screen when this turn started (its content, pages, media…). Call before site.call_tool.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        readOnly: true,
      },
      policy: OPERATOR_POLICY,
      handler: async ({ run }: ToolExecutionContext) => {
        const addressee = deps.addresseeOf(run.id);
        if (addressee === null) return { text: noActiveSiteText(), isError: true };
        const listed = await deps.siteTools.listTools({ siteDir: addressee.siteDir });
        if (!listed.available) return { text: `${addressee.name}'s tools are unavailable this turn: ${listed.reason}`, isError: true };
        return { site: addressee.name, tools: listed.tools };
      },
    },
    {
      descriptor: {
        id: "site.call_tool",
        description: "Run one of the on-screen website's own tools by id (from site.list_tools). It executes inside that website, against that website's content only.",
        inputSchema: { type: "object", properties: { toolId: { type: "string" }, input: { type: "object" } }, required: ["toolId"], additionalProperties: false },
      },
      policy: OPERATOR_POLICY,
      handler: async ({ run, input }: ToolExecutionContext) => {
        const addressee = deps.addresseeOf(run.id);
        if (addressee === null) return { text: noActiveSiteText(), isError: true };
        const { toolId, input: toolInput } = (input ?? {}) as { toolId?: unknown; input?: unknown };
        if (typeof toolId !== "string" || toolId === "") return { text: "toolId is required — take one from site.list_tools.", isError: true };
        const called = await deps.siteTools.callTool({ siteDir: addressee.siteDir, toolId, input: toolInput ?? {} });
        return called.ok ? called.output : { text: `${toolId} failed on ${addressee.name}: ${called.reason}`, isError: true };
      },
    },
  ];
}

/**
 * Every tool the desktop agent's registry holds. Static for the process lifetime; which site the
 * `site.*` pair reaches is decided per run, not here.
 *
 * @complexity O(n) in the shared desktop table.
 */
function buildDesktopAgentTools(deps: DesktopAgentToolDeps): ToolRegistration[] {
  return [...sharedDesktopTools(deps.sitesToolContext), navigateTool(deps.navigate), ...activeSiteTools(deps)];
}

/**
 * The gateway used until the site daemon grows its inbound tool-call route (SPEC-051 REQ-06,
 * `POST /api/admin/v1/desktop/tool-calls`). That route lives in the site's assistant server code,
 * which a concurrent job owns; until it lands every site reports unavailable, honestly, by name.
 */
const UNBUILT_SITE_TOOL_GATEWAY: SiteToolGateway = Object.freeze({
  listTools: async () => ({ available: false as const, reason: "this website does not expose its tools to the desktop chat yet (the site's inbound tool route is not built)." }),
  callTool: async () => ({ ok: false as const, reason: "this website does not expose its tools to the desktop chat yet (the site's inbound tool route is not built)." }),
});

export { buildDesktopAgentTools, DESKTOP_TOOL_PREFIX, NAVIGABLE_SECTIONS, UNBUILT_SITE_TOOL_GATEWAY };
export type { DesktopAgentToolDeps, SiteToolGateway, SiteToolSummary, TurnAddressee };
