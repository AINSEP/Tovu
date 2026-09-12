/**
 * @file The tool table the desktop shell publishes to the assistant, and the handlers behind it.
 *
 * This is the SEAM, not one tool. `mcp-bridge.mjs` is a transport and knows nothing about what any
 * tool does; everything shell-owned that the assistant should be able to reach is one row in
 * {@link SITES_MCP_TOOLS}. Adding the second, fifth or twentieth tool is adding a row, and the
 * transport, the trust declaration, the registration row and the tests all keep working unchanged.
 *
 * ## Every tool addresses a site EXPLICITLY
 *
 * There is deliberately no notion of "the current site" here. The assistant runs inside ONE site's
 * agent daemon, but the operator's question is routinely about a different one ("copy this image to
 * my other site"), so a tool that could only act on its own host would be the wrong shape from the
 * first line. Every tool that names a site takes a `siteDir`, resolved against the tracked-projects
 * registry — the same JSON file the Projects screen renders — and {@link listSites} is what lets
 * the assistant discover the valid values rather than guess a path.
 *
 * ## Trust declarations are honest, and they are declarations, not grants
 *
 * `apps/website`'s `mcp-federation/trust.ts` treats these annotations as a self-declaration from an
 * untrusted party: they can only ever REMOVE a tool's privileges (R3), never add any. So there is no
 * incentive to under-declare and no benefit to over-declaring — the numbers below say what each tool
 * actually does:
 *
 * - `readOnlyHint: true` — the tool reads and has no effect at all outside its own answer.
 *   {@link listSites} is the only one that qualifies.
 * - `readOnlyHint: false` — the tool writes, or has any other observable effect on the world.
 *   {@link addSitePointerTool} writes a registry row. {@link revealSiteFolder} writes nothing
 *   anywhere — and still declares `false`, **deliberately**, which is the one judgement call in this
 *   file worth defending. A narrow reading of the hint ("does it modify state?") would allow `true`,
 *   and `true` is cheaper: it would skip the `writeAllowedToolNames` requirement entirely. But the
 *   tool makes a window appear on the operator's screen — an observable side effect outside Tovu —
 *   and a self-declaration of "read-only" over an action with an external effect is precisely the
 *   claim `trust.ts` exists to distrust. Over-declaring costs exactly one line in the registration;
 *   under-declaring spends the meaning of the gate for every tool added after this one. So the rule
 *   this file follows is the stricter one: `readOnlyHint: true` requires that NOTHING happens except
 *   the answer.
 *
 *   Declaring `false` means the operator must name the tool in BOTH `allowedToolNames` and
 *   `writeAllowedToolNames` (`trust.ts` R3's override, enforced at `trust.ts:326` + `:370`), which
 *   `sites-mcp-registration.js` derives from this table rather than restating.
 * - `destructiveHint` is **never declared true by anything here, and must not be.** `trust.ts:325`
 *   refuses such a tool unconditionally, before either allowlist is consulted — so a destructive
 *   tool cannot be federated at all, and the answer is not to lie about it. Deletion is reached by
 *   {@link revealSiteFolder} taking the operator to the folder and letting them do it themselves;
 *   nothing destructive is ever one model-driven click away.
 *
 * No `electron` import, and no stdio: every handler is a plain function over injected dependencies,
 * callable from `node --test`. The reveal effect arrives as `context.revealPath` precisely so a test
 * never opens a real Finder window.
 */
import path from "node:path";

import { AddSitePointerError, addSitePointer } from "./add-site-pointer.js";
import { readTrackedSites } from "./tracked-sites.js";
import { classifySiteDirSafely } from "./site-dir-store.js";

/**
 * Narrow one required string argument out of an untrusted `tools/call` arguments bag.
 *
 * The arguments come from a language model, over a socket, shaped by a schema the model may simply
 * not have followed — so this validates rather than trusts, and every handler goes through it. A
 * missing or non-string value is a tool-level error naming the parameter, not a `TypeError` in a
 * stack trace the model cannot act on.
 *
 * @throws {ToolInputError} when the value is absent, not a string, or blank.
 * @complexity O(1).
 */
function requireStringArg(args, name) {
  const value = args?.[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ToolInputError(`'${name}' is required and must be a non-empty string.`);
  }
  return value;
}

/** A refusal caused by the CALLER's arguments, as opposed to a bug in this bridge. Separated so
 *  {@link runSitesMcpTool} can answer the model with a correctable message and still let a
 *  genuine internal fault surface as one. */
class ToolInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolInputError";
  }
}

/** The JSON-Schema every site-addressing tool shares. One constant so a second such tool cannot
 *  describe the same parameter differently and teach the model two conventions. */
const SITE_DIR_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    siteDir: {
      type: "string",
      description:
        "Absolute path to the Tovu site's folder — the `siteDir` value returned by `list_sites`. " +
        "A site folder is the one containing `config.json` and `.site-meta.json`.",
    },
  },
  required: ["siteDir"],
  additionalProperties: false,
});

/**
 * Every Tovu website this desktop app is tracking, with enough to address any of them.
 *
 * The discovery primitive the rest of the table depends on: without it a model asked to act on
 * "my other site" would have to invent a filesystem path. `present` is computed live rather than
 * stored, because a folder can be moved or deleted while the app is not running (the registry is a
 * cache of the world, and the world decides) — a model that sees `present: false` can say "that
 * site's folder is gone" instead of failing a later call for reasons it cannot explain.
 *
 * Reports `origin` too, since it is what decides whether deleting a project would erase its files,
 * and an assistant telling the operator what a delete will do must read the same fact the shell
 * enforces rather than guess from the path.
 *
 * @complexity O(n) in the tracked-row count, one `stat` pair per row.
 */
function listSites(_args, context) {
  const sites = readTrackedSites(context.projectsPath).map((row) => ({
    siteDir: row.siteDir,
    name: path.basename(row.siteDir),
    origin: row.origin,
    addedAt: row.createdAt,
    present: (context.classifySiteDir ?? classifySiteDirSafely)(row.siteDir) === "site",
  }));
  return {
    structured: { sites, count: sites.length },
    text:
      sites.length === 0
        ? "This Tovu desktop app is not tracking any websites yet."
        : sites.map((p) => `${p.name} — ${p.siteDir}${p.present ? "" : " (folder missing)"}`).join("\n"),
  };
}

/**
 * Point the app at a Tovu website that already exists on disk.
 *
 * A thin adapter over {@link addSitePointer}, which is the shared implementation the CLI and the IPC
 * handler also call — one function, three entry points, so the assistant cannot be told a folder is
 * acceptable that the button would refuse.
 *
 * Reports the idempotent and restoring cases distinctly rather than flattening them into "ok": a
 * model that said "added" when the site was already there would be describing work it did not do,
 * and an operator who had deliberately removed that project deserves to be told it is back.
 *
 * @complexity O(n) in the tracked-row count, plus one classification.
 */
function addSitePointerTool(args, context) {
  const requested = requireStringArg(args, "siteDir");
  const result = addSitePointer({
    siteDir: requested,
    projectsPath: context.projectsPath,
    // Absolute paths only from a model: a relative path would resolve against the agent daemon's
    // cwd, which is neither the operator's shell cwd nor anything they can see. `cwd` is pinned to
    // the root so a relative argument becomes an obviously-wrong absolute path and is refused by
    // the classifier, rather than silently resolving somewhere surprising.
    cwd: path.sep,
    classifySiteDir: context.classifySiteDir,
  });
  return { structured: result, text: describeAddResult(result) };
}

/** {@link addSitePointerTool}'s operator-facing sentence, split out to keep that function's
 *  complexity under the shop ceiling. @complexity O(1). */
function describeAddResult(result) {
  if (result.alreadyTracked) return `${result.siteDir} was already in your websites — nothing changed.`;
  if (result.alreadyDismissed) {
    return `Added ${result.siteDir} back to your websites. You had removed this website before; adding it by name brings it back.`;
  }
  return `Added ${result.siteDir} to your websites. The folder was not moved, copied, or changed.`;
}

/**
 * Show the operator a site's folder in their file manager, so they can act on it themselves.
 *
 * **This is what stands in place of a delete tool, and the substitution is the point.** A
 * `delete_site` tool would have to declare `destructiveHint: true` to be honest, and
 * `trust.ts:325` refuses such a tool unconditionally regardless of either allowlist — so the only
 * ways to ship one are to lie about it or to build a confirmation mechanism that puts an
 * irreversible action one habituated click from a model's output. Taking the operator to the folder
 * instead removes the destructive capability rather than guarding it: the assistant can be as
 * helpful as it likes about *where* the thing is, and the hands that delete it are the operator's.
 *
 * Refuses a site the app is not tracking, rather than opening an arbitrary path a model supplied.
 * That check is the whole security surface of this tool: without it, `siteDir` is an
 * attacker-influenceable argument to a "show this to the user" effect.
 *
 * @complexity O(n) in the tracked-row count.
 */
async function revealSiteFolder(args, context) {
  const requested = requireStringArg(args, "siteDir");
  const siteDir = path.resolve(path.sep, requested);
  const tracked = readTrackedSites(context.projectsPath).some((row) => row.siteDir === siteDir);
  if (!tracked) {
    throw new ToolInputError(
      `${siteDir} is not one of this app's websites, so it will not be opened. Call 'list_sites' and use one of the 'siteDir' values it returns.`,
    );
  }

  await context.revealPath(siteDir);
  return {
    structured: { siteDir, revealed: true },
    text: `Opened ${siteDir} in a file-manager window. You can act on the folder there yourself — nothing was changed.`,
  };
}

/**
 * The published tool surface. Order is the order `tools/list` reports.
 *
 * `name` values are what `trust.ts` R1 prefixes into `mcp__tovu-desktop__<name>`, so they must match
 * its `REMOTE_TOOL_NAME_PATTERN` (leading alphanumeric, then alphanumerics/`_`/`.`/`-`, ≤64) — all
 * of these do. Descriptions are read by the model every turn; they state what the tool will and will
 * not do to the operator's files, because "does this move my site?" is the question a person asks
 * first and the model must be able to answer it without calling anything.
 */
const SITES_MCP_TOOLS = Object.freeze([
  Object.freeze({
    name: "list_sites",
    description:
      "List the Tovu websites this desktop app is tracking, with the absolute folder path of each. " +
      "Call this first whenever a request concerns a specific site — the `siteDir` values it returns " +
      "are the only valid site addresses for the other desktop tools. Reads nothing but the app's own list.",
    inputSchema: Object.freeze({ type: "object", properties: {}, additionalProperties: false }),
    annotations: Object.freeze({ title: "List Tovu websites", readOnlyHint: true }),
    handler: listSites,
  }),
  Object.freeze({
    name: "add_site_pointer",
    description:
      "Add an EXISTING Tovu website to this app's list of websites by its folder path. The folder is " +
      "only pointed at: it is never moved, copied, renamed, or written to, and no new site is ever " +
      "created — a folder that is empty or is not already a complete Tovu site is refused with the " +
      "reason. Use this when someone wants a site they already have to show up in the app.",
    inputSchema: Object.freeze({
      type: "object",
      properties: {
        siteDir: {
          type: "string",
          description:
            "Absolute path to the existing site's folder — the one containing `config.json` and `.site-meta.json`.",
        },
      },
      required: ["siteDir"],
      additionalProperties: false,
    }),
    // `false`, because this writes a row to the app's registry. That declaration is what requires
    // the operator to name this tool in BOTH allowlists (`trust.ts` R3's override) — the cost is one
    // extra line in the registration, and the alternative is a false claim at a trust boundary.
    annotations: Object.freeze({ title: "Add an existing Tovu website", readOnlyHint: false }),
    handler: addSitePointerTool,
  }),
  Object.freeze({
    name: "reveal_site_folder",
    description:
      "Open a tracked site's folder in the operator's file manager so they can work with it " +
      "directly — this is how to help someone DELETE, move, back up, or inspect a site: take them " +
      "to it and let them do it. Changes nothing and deletes nothing. Only folders already in the " +
      "app's list of websites can be opened.",
    inputSchema: SITE_DIR_SCHEMA,
    // `false` even though nothing is modified anywhere — see this file's header for the full
    // argument. Short version: a window appears on the operator's screen, so this is not "read-only"
    // in any sense a trust gate should accept from the thing being classified.
    annotations: Object.freeze({ title: "Reveal a website's folder", readOnlyHint: false }),
    handler: revealSiteFolder,
  }),
]);

/** The `tools/list` payload: the table minus its handlers. Built rather than stored so a tool can
 *  never be published with a description that drifts from the handler it dispatches to.
 *  @complexity O(n) in the tool count. */
function describeSitesMcpTools() {
  return SITES_MCP_TOOLS.map(({ name, description, inputSchema, annotations }) => ({
    name,
    description,
    inputSchema,
    annotations,
  }));
}

/**
 * Run one `tools/call` and return an MCP tool result.
 *
 * Every failure becomes an `isError: true` RESULT rather than a JSON-RPC error, which is the MCP
 * distinction that matters here: a protocol error is "this request was malformed", while an unknown
 * tool name, a rejected folder, or a bad argument are all *answers* the model should read and act
 * on. Raising them as transport errors would hide the reason behind a generic failure and leave the
 * model with nothing to correct.
 *
 * An unexpected internal fault is reported as an error result too, but with its message passed
 * through — the alternative is an assistant that says "it failed" while the actual cause sits only
 * in a log nobody is reading at the time.
 *
 * @complexity O(n) in the tool count, plus the chosen handler's own cost.
 */
async function runSitesMcpTool(name, args, context) {
  const tool = SITES_MCP_TOOLS.find((entry) => entry.name === name);
  if (tool === undefined) {
    return toolError(`Unknown tool '${name}'. Available: ${SITES_MCP_TOOLS.map((entry) => entry.name).join(", ")}.`);
  }
  try {
    const { text, structured } = await tool.handler(args ?? {}, context);
    return { content: [{ type: "text", text }], structuredContent: structured };
  } catch (err) {
    if (err instanceof ToolInputError) return toolError(err.message);
    if (err instanceof AddSitePointerError) return toolError(err.message, { code: err.code });
    return toolError(`The Tovu desktop app could not complete '${name}': ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** One failed tool result. @complexity O(1). */
function toolError(message, structured = {}) {
  return { content: [{ type: "text", text: message }], structuredContent: { error: message, ...structured }, isError: true };
}

export { SITES_MCP_TOOLS, ToolInputError, describeSitesMcpTools, runSitesMcpTool };
