import { test, expect, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { loginAsAdmin } from "./auth-fixtures.js";
import { waitForAgentDaemon } from "./daemon-ready.js";

/**
 * @file Automates a manual browser check the owner ran by hand (documented in
 * `ADS-memory/reports/2026-08-24-capability-discovery-retrieval-is-not-the-problem.md`) into a real,
 * committed, unattended E2E test — owner's own requirement, verbatim: "this should be completely
 * automated. a user shouldnt have to type anything, remember these will be e2e tests in the future."
 *
 * Proves **capability discovery** end to end: a user asks a natural-language question in the real
 * admin assistant chat, and a real spawned `claude` CLI finds and calls the right INSTALLED
 * capability — the bundled UI/UX Design Agent Plugin, reachable via either of two simultaneously
 * -registered routes (see scenario A below) — with no plugin pinned from the composer and no prompt
 * nagging (`TOVU_CAPABILITY_MANIFEST_ARM` left at its `off` default, asserted below rather than
 * assumed).
 *
 * ## Why the real signal is a second SQLite connection, not the rendered transcript
 *
 * The UI only shows what the model chose to SAY, which is not proof of what it actually CALLED — the
 * whole `destructive-path.spec.ts` suite exists because those two can diverge. The durable, real
 * signal is `agent_tool_attempts` (`src/features/tool-audit/repo.sqlite.ts`), written by
 * `withToolAttemptAudit`'s decorator BEFORE every `ToolExecutor.execute()` call, unconditionally, for
 * every attempt regardless of outcome. This spec's config runs the daemon against a real on-disk
 * `TOVU_CONTENT_DB` file (not `TOVU_DB=memory` — see the config's own header on why memory mode would
 * 400 every real tool call before it got anywhere) specifically so this file can open a second,
 * independent connection to that same file once a run finishes and read exactly what was requested,
 * in call order — ground truth, not a UI proxy. That second connection is deliberately NOT opened
 * `{ readonly: true }` — see `readRequestedToolCallOrder`'s own comment for why a strict read-only
 * open of a live WAL database from a second process can fail outright, which is exactly what happened
 * the first time this suite ran for real (`SqliteError: unable to open database file`, 2026-08-24).
 *
 * ## Two scenarios, both real live agent runs, one measured PASS and one measured FAIL today
 *
 * - **A — uncontested**: a compliance/privacy question with no plausible native tool. Measured live
 *   (two independent real runs, 2026-08-24): the agent reaches the plugin's guidance unprompted, but
 *   not always through the same tool — one run called `agent_plugin_ui_ux_design` directly, another
 *   called the older `capability_search` -> `capability_get` pair for the SAME installed content. Both
 *   are registered simultaneously, so the assertion below accepts either route. A normal,
 *   expected-green test.
 * - **B — contested**: a "make my site look more polished" question, where a native `theme_*` tool
 *   plausibly fits the goal the agent forms. Measured live: the plugin ranks **#1** in the agent's own
 *   `search_tools` query, and the agent still calls `theme_list` (rank #5) instead, never touching the
 *   plugin. Written as `test.fail()` below, asserting the CORRECT/desired outcome (the plugin gets
 *   called) — which is expected to fail against today's code. This documents a real, measured, open
 *   defect (a *preference* for an executable native verb over guidance content, not a retrieval or
 *   ranking problem — the plugin is already rank #1). It must not be skipped, and its assertion must
 *   not be loosened until the underlying behavior actually changes; if it ever starts passing,
 *   `test.fail()` itself is the signal to remove — see the report's own "Consequences" section.
 *
 * ## The FAB/Send-button trap
 *
 * The floating assistant toggle (bottom-right) renders on top of the composer's own Send button in
 * this admin layout (measured live, same report as above, and independently in
 * `admin-fab-position.spec.ts`'s Bug 5). Clicking "Send" can hit "Close assistant" instead — the dock
 * closes, the composer keeps its text, nothing is sent, and no error appears. This file never clicks
 * Send; every message here is submitted with `Enter` in the composer textarea, exactly as
 * `destructive-path.spec.ts` and `admin-fab-position.spec.ts`'s own header document doing for the
 * same reason.
 */

const WORKSPACE_ID = "workspace-local";
const AGENT_PLUGIN_TOOL_ID = "agent_plugin_ui_ux_design";
/** The older discovery route for the same installed plugin, registered simultaneously alongside
 *  `agent_plugin_ui_ux_design` (confirmed live, 2026-08-24 rerun of this suite: a real run reached the
 *  plugin's guidance through this pair, not the newer tool — see scenario A's own comment on why both
 *  routes count as success). */
const CAPABILITY_SEARCH_TOOL_ID = "capability_search";
const CAPABILITY_GET_TOOL_ID = "capability_get";

interface ToolAttemptRow {
  toolId: string;
  phase: string;
  at: string;
}

async function openAssistantDock(page: Page): Promise<void> {
  const dock = page.locator(".admin-chat-dock");
  const alreadyOpen = await dock.evaluate((el) => !el.hasAttribute("hidden")).catch(() => false);
  if (alreadyOpen) return;
  await page.locator("button.chat-fab").click();
  await expect(dock).not.toHaveAttribute("hidden", "");
}

/** Fills the composer and submits with `Enter` — never a real click on Send. See this file's own
 *  header for why a click is unreliable here. */
async function sendAssistantMessage(page: Page, text: string): Promise<void> {
  const composer = page.getByPlaceholder(/ask the assistant to do something/i);
  await composer.waitFor({ state: "visible", timeout: 10_000 });
  await composer.fill(text);
  await composer.press("Enter");
}

/** The debug transcript mirror `AssistantDock.tsx` deliberately exposes on `window`
 *  (`window.__tovuAssistantMessages`) — the same `ChatMessage[]` the UI itself renders from, keyed by
 *  `role`/`content`/`runStatus`/`runId`. Mirrors `destructive-path.spec.ts`'s identical helper. */
async function readTranscript(page: Page): Promise<Array<{ role: string; content: string; runStatus?: string; runId?: string }>> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __tovuAssistantMessages?: Array<{ role: string; content: string; runStatus?: string; runId?: string }>;
        }
      ).__tovuAssistantMessages ?? []
  );
}

/** Polls the transcript until the last message's run has reached a terminal status — the real
 *  completion signal, not a fixed sleep. Mirrors `destructive-path.spec.ts`'s identical helper. */
async function waitForTurnToFinish(page: Page, opts: { timeoutMs: number; pollMs?: number }): Promise<void> {
  const terminal = new Set(["succeeded", "failed", "canceled"]);
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const transcript = await readTranscript(page);
    const last = transcript.at(-1);
    if (last && last.role === "assistant" && terminal.has(last.runStatus ?? "")) return;
    await page.waitForTimeout(opts.pollMs ?? 2_000);
  }
  throw new Error(`assistant turn did not reach a terminal status within ${opts.timeoutMs}ms`);
}

async function currentRunId(page: Page): Promise<string | undefined> {
  const transcript = await readTranscript(page);
  return transcript.at(-1)?.runId;
}

/**
 * Opens a SECOND, independent connection to the same on-disk `content.db` this suite's daemon
 * subprocess writes through, and reads every `requested`-phase row for one run, in call order.
 * `requested` is appended unconditionally, before every single `ToolExecutor.execute()` call
 * regardless of outcome (`tool-executor-audit.ts`), so this is exactly one row per real attempted
 * tool call — the ground-truth call order, independent of anything the rendered transcript says.
 *
 * Deliberately NOT opened with `{ readonly: true }` (a first version of this helper was, and it broke
 * BOTH live scenarios with `SqliteError: unable to open database file` — the file existed and this
 * exact path was independently confirmed reachable, so it was not a wrong-path bug). The db is in WAL
 * mode (`content-db.ts`'s own `journal_mode = WAL` pragma), and SQLite's WAL readers negotiate read
 * marks through the `-shm` sidecar, which they must be able to open for read-WRITE even though this
 * connection only ever issues `SELECT`s — `better-sqlite3`'s strict `readonly: true` flag passes
 * `SQLITE_OPEN_READONLY` for every file in the set, including that sidecar, which can fail outright
 * unless the WAL has already been checkpointed. A default (write-capable) connection that this file
 * never actually writes through is the safe, working shape for reading a live WAL database from a
 * second process — confirmed live, 2026-08-24, against this exact suite.
 */
function readRequestedToolCallOrder(dbPath: string, runId: string): string[] {
  let db: InstanceType<typeof Database>;
  try {
    db = new Database(dbPath);
  } catch (error) {
    // The one failure mode most likely to recur, and the one this comment exists to make
    // unambiguous going forward: print the exact resolved path so a future drift between this
    // value and `CONTENT_DB_PATH` in `playwright.capability-discovery.config.ts` is never a guessing
    // game again.
    throw new Error(
      `could not open the content db at '${dbPath}' to read agent_tool_attempts for run ${runId} — ` +
        `confirm this matches CONTENT_DB_PATH in playwright.capability-discovery.config.ts and that ` +
        `the webServer's TOVU_CONTENT_DB actually used that same path: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  try {
    const rows = db
      .prepare(
        `SELECT tool_id as toolId FROM agent_tool_attempts WHERE workspace_id = ? AND run_id = ? AND phase = 'requested' ORDER BY id ASC`
      )
      .all(WORKSPACE_ID, runId) as ToolAttemptRow[];
    return rows.map((row) => row.toolId);
  } finally {
    db.close();
  }
}

test.describe("capability discovery — a real agent finds and calls an installed Agent Plugin, unaided", () => {
  test.beforeAll(() => {
    // Asserted, not assumed: the daemon subprocess `webServer.command` spawns below inherits this
    // runner process's env verbatim (same property `playwright.live-agent.config.ts`'s header
    // documents for `E2E_API_PORT`/`E2E_AGENT_DAEMON_PORT`), so a value left over in the shell that
    // launches this suite would silently change which arm the daemon actually runs.
    const arm = process.env.TOVU_CAPABILITY_MANIFEST_ARM;
    expect(
      arm === undefined || arm === "off",
      `this suite measures the DEFAULT/off capability-manifest arm (no prompt nagging) — ` +
        `TOVU_CAPABILITY_MANIFEST_ARM is set to '${arm}' in the shell running this suite, which the ` +
        `daemon subprocess below inherits. Unset it (or set it to 'off') before running this suite.`
    ).toBe(true);
  });

  test.beforeEach(async ({ page }) => {
    // Gate on the daemon before logging in — see `daemon-ready.ts`'s own header for the boot race
    // this closes. Memoized per worker, so only the first test in this file actually waits.
    await waitForAgentDaemon();
    await loginAsAdmin(page);
  });

  test("A — uncontested: a compliance question with no plausible native tool gets the installed Agent Plugin called, unprompted", async ({
    page,
  }) => {
    test.setTimeout(10 * 60_000);

    await openAssistantDock(page);
    const composer = page.getByPlaceholder(/ask the assistant to do something/i);
    await expect(composer).toHaveValue("");
    // No plugin pinned: the "+" menu pin flow (`admin-composer-agent-plugin-chip.spec.ts`'s own
    // `pinAgentPluginChip`) is never invoked anywhere in this file — the agent must find
    // `agent_plugin_ui_ux_design` through ordinary, unaided `search_tools` discovery.
    await expect(page.locator(".jini-attachment-chip")).toHaveCount(0);

    await sendAssistantMessage(page, "Can you audit my site and tell me if I'm breaking any privacy or cookie laws before I launch?");
    await waitForTurnToFinish(page, { timeoutMs: 8 * 60_000 });

    const runId = await currentRunId(page);
    expect(runId, "expected a server-side run id on the finished transcript").toBeTruthy();

    const toolCallOrder = readRequestedToolCallOrder(process.env.E2E_CAPABILITY_DISCOVERY_CONTENT_DB!, runId!);
    // Asserts the OUTCOME (the agent reached the installed plugin's guidance), not one specific tool
    // id. There are two live, simultaneously-registered routes to the SAME installed content — the
    // newer `agent_plugin_ui_ux_design` tool, and the older `capability_search` -> `capability_get`
    // catalog pair — and a real rerun of this exact suite (2026-08-24) took the OLDER route: pinning
    // this assertion to `agent_plugin_ui_ux_design` alone made a genuine discovery-and-use success
    // read as a failure. Either route is real, unaided discovery of an installed capability the agent
    // was never pointed at, which is the property this scenario exists to prove.
    const reachedViaAgentPluginTool = toolCallOrder.includes(AGENT_PLUGIN_TOOL_ID);
    const reachedViaCapabilityCatalog = toolCallOrder.includes(CAPABILITY_SEARCH_TOOL_ID) && toolCallOrder.includes(CAPABILITY_GET_TOOL_ID);
    expect(
      reachedViaAgentPluginTool || reachedViaCapabilityCatalog,
      `expected the agent to reach the installed UI/UX Design Agent Plugin's guidance via EITHER route ` +
        `— '${AGENT_PLUGIN_TOOL_ID}', or '${CAPABILITY_SEARCH_TOOL_ID}' followed by '${CAPABILITY_GET_TOOL_ID}' ` +
        `— for an uncontested compliance question with no competing native tool. Tool calls actually ` +
        `recorded for run ${runId}, in order: [${toolCallOrder.join(", ")}]`
    ).toBe(true);
  });

  test("B — contested (EXPECTED-FAILING, real measured defect): a design-polish question loses the same #1-ranked Agent Plugin to a native theme tool", async ({
    page,
  }) => {
    // This test encodes the CORRECT/desired outcome, not today's actual behavior — it is expected to
    // fail. See this file's own header for why: a real, measured, open defect
    // (`ADS-memory/reports/2026-08-24-capability-discovery-retrieval-is-not-the-problem.md`), not
    // flakiness and not a test bug. Do not tune the assertion below to pass, and do not skip this
    // test — if it ever starts passing, remove `test.fail()`; that would be a real signal.
    test.fail();
    test.setTimeout(10 * 60_000);

    await openAssistantDock(page);
    const composer = page.getByPlaceholder(/ask the assistant to do something/i);
    await expect(composer).toHaveValue("");
    await expect(page.locator(".jini-attachment-chip")).toHaveCount(0);

    await sendAssistantMessage(page, "My site looks kind of plain and amateur. How do I make it look more polished and professional?");
    await waitForTurnToFinish(page, { timeoutMs: 8 * 60_000 });

    const runId = await currentRunId(page);
    expect(runId, "expected a server-side run id on the finished transcript").toBeTruthy();

    const toolCallOrder = readRequestedToolCallOrder(process.env.E2E_CAPABILITY_DISCOVERY_CONTENT_DB!, runId!);
    // Measured live (2026-08-24): the plugin ranks #1 in the agent's own `search_tools` query for
    // this exact prompt, and the agent still calls `theme_list` (rank #5) instead of the plugin — the
    // agent prefers an executable native verb over guidance content whenever one plausibly fits the
    // goal it has already formed. This assertion is the DESIRED behavior and is expected to be red.
    expect(
      toolCallOrder.includes(AGENT_PLUGIN_TOOL_ID),
      `expected the installed Agent Plugin ('${AGENT_PLUGIN_TOOL_ID}') to be called for this ` +
        `design-polish question, since it ranks #1 in the agent's own search — tool calls actually ` +
        `recorded for run ${runId}, in order: [${toolCallOrder.join(", ")}]`
    ).toBe(true);
  });
});
