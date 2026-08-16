import { publishStaticSite, type StaticPublishDeps, type StaticPublishInput } from "./adapter";
import type { PublishHistoryEntry, PublishHistoryStore, PublishTrigger } from "./publish-history";
import type { StaticPublishOutcome, StaticPublishTargetId } from "./types";

/**
 * @file This sub-feature's process-local single-flight state for a real publish, extracted out of
 * `server/routes/admin/system/publish-site.ts` (2026-08-16, Terra audit finding #1) so a SECOND
 * caller — `deployment_execute_static_publish` (`publish-agent-tools.ts`, the assistant's
 * MCP-UI-confirmed publish tool) — can share the exact same guard the admin route's own trigger
 * already enforced, instead of calling {@link publishStaticSite} directly with no tracking at all.
 *
 * Before this file existed, `publish-site.ts` held its own PRIVATE `currentRun` module variable and
 * checked it before every trigger; `publish-agent-tools.ts` had no equivalent slot to check at all
 * (not merely a bug in its own guard — there was structurally nothing for it to check, since the
 * state lived un-exported in a `src/server/**` file this domain must never import from — see this
 * module's placement note below). Two publishes to the same or even different targets both run a
 * fresh `clean` export into a shared per-target output directory (`adapter.ts`'s `publishOutputDir`);
 * a human clicking "Publish" in the admin UI at the same moment an agent's confirmed
 * `deployment_execute_static_publish` call reached its own `publishStaticSite` invocation could
 * clean and rewrite the same directory out from under each other. This became reachable the day
 * `deployment_execute_static_publish` went from unwired to a real, agent-callable tool.
 *
 * Lives in `static-publish/`, not this domain's sibling `features/deployments/export-run.ts` — a
 * DIFFERENT sub-feature (this file's own imports are `static-publish/adapter.ts`'s `publishStaticSite`
 * only, never `#src/export/index`), but the SAME reasoning `export-run.ts`'s header gives for its own
 * placement applies here too: `server/routes/admin/system/publish-site.ts` (a `src/server/**` file)
 * is free to import FROM this domain, but `publish-agent-tools.ts`'s own `tool-registrations.ts`-style
 * rule (see `deployments/tool-registrations.ts`'s file header) forbids the reverse — a domain's
 * tool-wiring file must never import from `src/server/**`. Putting the shared slot here, not there,
 * is what lets both callers import ONE real module without either one crossing that back-edge.
 *
 * DISCLOSED CROSS-PROCESS GAP, same shape `export-run.ts`'s own header already discloses for its own
 * `currentRun`: this module's `currentRun` is a plain in-memory variable, single-flight-correct only
 * WITHIN one OS process. Tovu's admin HTTP server and the standalone agent daemon
 * (`assistant/agent-daemon-server.ts`) each load their own independent copy of this module — there is
 * no cross-process lock, and this file does not attempt to add one (that is a design change, e.g. a
 * lockfile under the publish output directory or routing the daemon's call back over HTTP to the main
 * process — out of scope for this fix, which closes the WITHIN-process gap only). The in-process BYOK
 * execution mode (`server/modules/assistant-byok.ts`, composing the same tool catalog inside the main
 * server process) shares this exact module instance with the admin HTTP route, so single-flight holds
 * there — which is the concrete scenario this fix closes (a human using the admin UI's Static Site tab
 * and the assistant dock in the SAME running server, at the same time).
 *
 * ## Publish history (2026-08-16, Defect 2; reworked same day into an append-only DB table)
 *
 * The SAME reason this module exists in the first place — one shared slot both `publish-site.ts`'s
 * HTTP trigger route and `deployment_execute_static_publish` settle through — is why publish HISTORY
 * is also recorded here rather than in either caller: recording it once, at the one place both routes
 * already converge, means neither call site needs to change to gain it. `settleWithOutcome`/
 * `settleWithError` above are this module's PRE-EXISTING job (the single-flight snapshot); recording
 * history is a separate, additional side effect performed alongside them, not folded into them, so a
 * reader auditing "what does settling a run do to the shared snapshot" is not also reading unrelated
 * persistence code. See `./publish-history.ts`'s own header for the storage design (an append-only
 * `publish_history` table, `src/db/schema.ts`; migration `0043`).
 *
 * `historyStore` is a REQUIRED parameter on both {@link startPublishRun} and
 * {@link runPublishAndAwait} — deliberately no module-level default the way this file's original
 * (file-backed) design had one. A DB-backed store needs a live `ContentDb` handle to construct, and
 * only the composition root (`server/deps.ts`/`server/app.ts`) has one; a module-level singleton
 * constructed at import time cannot get one without either module-load-time I/O (this module's own
 * prior header explicitly avoided that) or a global mutable setter (a worse shape than just requiring
 * the argument). Both real callers thread it from `RouteDeps.publishHistoryStore` — `publish-site.ts`
 * passes `deps.publishHistoryStore` straight through; `publish-agent-tools.ts`'s
 * `StaticPublishToolDeps` does the same, with its own `historyStore` field staying a TEST-ONLY
 * override on top (see that file's own doc). Every test in `publish-run.unit.test.ts` already passes
 * an explicit `InMemoryPublishHistoryStore`, so this change needed no test-signature updates.
 *
 * `toHistoryEntry` below also decides `triggeredBy` (`'admin_ui'` vs `'agent_tool'`) — not a
 * caller-supplied field, but a literal each of {@link startPublishRun}/{@link runPublishAndAwait}
 * hardcodes when it calls {@link recordHistoryIfPublished}, since which function ran IS the answer
 * (see `publish-history.ts`'s own `PublishTrigger` doc).
 */

export type PublishRunStatus = "idle" | "running" | "completed" | "errored";

export interface PublishRunSnapshot {
  status: PublishRunStatus;
  startedAtIso: string | null;
  finishedAtIso: string | null;
  target: StaticPublishTargetId | null;
  /** Present only once `status` is `"completed"` or `"errored"` AND the run reached a real outcome
   *  (see {@link runPublishAndAwait}'s own doc for the one path that settles the run WITHOUT ever
   *  populating this — an unexpected throw out of `publishStaticSite` populates `error` instead). */
  result?: StaticPublishOutcome;
  /** Populated only when the run settled via an unexpected throw rather than a normal
   *  `StaticPublishOutcome` — a message, never the raw error object, same boundary
   *  `export-run.ts`'s own `error` field crosses. */
  error?: string;
}

const IDLE_RUN: PublishRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, target: null };

/** Process-local mutable slot — see this file's header for exactly which callers share ONE instance
 *  of it and which do not. */
let currentRun: PublishRunSnapshot = IDLE_RUN;

/**
 * Maps a settled `outcome` into the durable record this run's publish produced — `undefined` when
 * nothing was actually published (`outcome.ok === false`; see {@link PublishHistoryEntry}'s own doc
 * on why a failure is never recorded at all, not recorded-as-failed). `owner`/`repo`/`branch` are read
 * off `input.config` (present only for `github-pages` — `StaticPublishConfig`'s own per-target split,
 * `./types.ts`) rather than off `outcome`, which carries neither; `branch` falls back to `'gh-pages'`
 * when `config.branch` was omitted, the same default `GitHubPagesDeployTarget` itself applies
 * (`types.ts`'s `GitHubPagesPublishConfig` doc).
 *
 * `commitSha` is derived, not caller-supplied: `outcome.deploymentId` is verified (against
 * `@jini-ai/devops`'s `github-pages.ts`, `publish()`'s own `deploymentId: commitSha` return) to be a
 * real git commit sha for `github-pages` specifically, and something else entirely (a provider's own
 * deployment id) for every other target — so it is copied into `commitSha` ONLY on that one branch,
 * left `undefined` everywhere else. `deploymentId` itself is always carried through unconditionally
 * when the outcome has one, regardless of target.
 *
 * @complexity O(1) — fixed-shape field mapping, no iteration.
 */
function toHistoryEntry(
  input: StaticPublishInput,
  outcome: StaticPublishOutcome,
  clock: { nowIso(): string },
  triggeredBy: PublishTrigger
): PublishHistoryEntry | undefined {
  if (!outcome.ok) return undefined;
  const { config } = input;
  const isGitHubPages = config.target === "github-pages";
  return {
    target: outcome.targetId,
    url: outcome.url,
    reachable: outcome.ok === true,
    status: outcome.status,
    projectName: input.projectName,
    publishedAt: clock.nowIso(),
    triggeredBy,
    ...(isGitHubPages ? { owner: config.owner, repo: config.repo, branch: config.branch ?? "gh-pages" } : {}),
    ...(outcome.basePath !== undefined ? { basePath: outcome.basePath } : {}),
    ...(outcome.deploymentId !== undefined ? { deploymentId: outcome.deploymentId } : {}),
    ...(isGitHubPages && outcome.deploymentId !== undefined ? { commitSha: outcome.deploymentId } : {}),
  };
}

/**
 * Records a settled outcome's history, if it produced one — best-effort, never throws and never
 * changes what the caller reports. A failed history write (a DB error, a full disk) must not turn an
 * otherwise-successful publish into a reported failure: the caller already has the TRUE outcome from
 * {@link publishStaticSite} and returns it regardless: losing "where did we last publish" is a
 * strictly smaller problem than a hard error on this genuinely non-essential bookkeeping step layered
 * on top of a publish that already succeeded.
 *
 * @complexity O(1) — see {@link PublishHistoryStore.recordSuccess}'s own cost note.
 */
async function recordHistoryIfPublished(
  historyStore: PublishHistoryStore,
  input: StaticPublishInput,
  outcome: StaticPublishOutcome,
  clock: { nowIso(): string },
  triggeredBy: PublishTrigger
): Promise<void> {
  const entry = toHistoryEntry(input, outcome, clock, triggeredBy);
  if (entry === undefined) return;
  try {
    await historyStore.recordSuccess({ workspaceId: input.workspaceId, entry });
  } catch {
    // Swallowed deliberately — see this function's own doc.
  }
}

/**
 * The current/most recent publish run's status, exactly as both callers report it (the HTTP status
 * poll route, and — indirectly, via a thrown/returned refusal — the agent tool).
 *
 * @returns `IDLE_RUN` if no run has ever started in this process.
 * @complexity O(1).
 */
export function getPublishRunSnapshot(): PublishRunSnapshot {
  return currentRun;
}

function beginRun(target: StaticPublishTargetId, clock: { nowIso(): string }): string {
  const startedAtIso = clock.nowIso();
  currentRun = { status: "running", startedAtIso, finishedAtIso: null, target };
  return startedAtIso;
}

function settleWithOutcome(startedAtIso: string, target: StaticPublishTargetId, outcome: StaticPublishOutcome, clock: { nowIso(): string }): void {
  currentRun = { status: outcome.ok ? "completed" : "errored", startedAtIso, finishedAtIso: clock.nowIso(), target, result: outcome };
}

function settleWithError(startedAtIso: string, target: StaticPublishTargetId, err: unknown, clock: { nowIso(): string }): void {
  currentRun = { status: "errored", startedAtIso, finishedAtIso: clock.nowIso(), target, error: err instanceof Error ? err.message : String(err) };
}

/**
 * Starts a new publish run unconditionally and returns the "running" snapshot immediately — the
 * publish itself continues in the background. Used by `publish-site.ts`'s HTTP trigger route, which
 * returns `202` and lets the caller poll {@link getPublishRunSnapshot} for the outcome (same
 * fire-and-forget shape as `export-run.ts`'s `startExportRun`, which this mirrors).
 *
 * Caller contract: the caller must have already confirmed `getPublishRunSnapshot().status !==
 * "running"` in the SAME synchronous stretch of the event loop, with no `await` in between — this
 * function does not re-check, so calling it while a run is already in flight would silently start a
 * second one; it is deliberately not the guard itself (identical contract to `startExportRun`'s own
 * doc, restated here rather than merely cross-referenced since violating it is exactly the bug this
 * whole file exists to close).
 *
 * @param historyStore - See this file's header ("Publish history") — REQUIRED, no module-level
 *   default; real callers pass `RouteDeps.publishHistoryStore`, tests pass an
 *   `InMemoryPublishHistoryStore`.
 * @complexity O(1) synchronously; the awaited publish itself is bounded by `publishStaticSite`'s own
 *   complexity note (one export pass plus one provider's fixed poll budget).
 */
export function startPublishRun(deps: StaticPublishDeps, input: StaticPublishInput, clock: { nowIso(): string }, historyStore: PublishHistoryStore): PublishRunSnapshot {
  const startedAtIso = beginRun(input.config.target, clock);

  void publishStaticSite(deps, input)
    .then(async (outcome) => {
      settleWithOutcome(startedAtIso, input.config.target, outcome, clock);
      await recordHistoryIfPublished(historyStore, input, outcome, clock, "admin_ui");
    })
    .catch((err: unknown) => settleWithError(startedAtIso, input.config.target, err, clock));

  return currentRun;
}

/**
 * Starts a new publish run and awaits its outcome, for a caller that must return the real result
 * synchronously within one call rather than poll a separate status endpoint —
 * `deployment_execute_static_publish`'s confirmed path (`publish-agent-tools.ts`): the agent's tool
 * call blocks until the human confirms AND the publish itself settles, so there is no separate poll
 * step for it to report through the way the HTTP trigger route does.
 *
 * Updates the SAME shared {@link currentRun} slot {@link startPublishRun} does, so a concurrent HTTP
 * trigger sees "running" while this call is in flight, and vice versa — this is the actual fix for
 * the cross-caller race: both entry points into a real publish now go through one guarded slot.
 *
 * Same caller contract as {@link startPublishRun}: the caller must have already confirmed
 * `getPublishRunSnapshot().status !== "running"` in the same synchronous stretch, no `await` in
 * between, before calling this.
 *
 * If `publishStaticSite` itself throws (it documents that it never does, but see this dispatch's
 * separate finding on that contract), the run is still settled to `"errored"` — the slot must never
 * stay stuck on `"running"` forever just because the underlying call broke its own contract — and the
 * error is RE-THROWN unchanged, preserving `deployment_execute_static_publish`'s existing behavior for
 * an unexpected throw (this function adds single-flight bookkeeping around the call, not a new error
 * shape).
 *
 * @param historyStore - See this file's header ("Publish history") — REQUIRED, no module-level
 *   default; real callers pass `RouteDeps.publishHistoryStore`, tests pass an
 *   `InMemoryPublishHistoryStore`.
 * @complexity Same bound as {@link startPublishRun} — one export pass plus one provider's fixed poll
 *   budget — but AWAITED by the caller rather than backgrounded.
 */
export async function runPublishAndAwait(
  deps: StaticPublishDeps,
  input: StaticPublishInput,
  clock: { nowIso(): string },
  historyStore: PublishHistoryStore
): Promise<StaticPublishOutcome> {
  const startedAtIso = beginRun(input.config.target, clock);
  try {
    const outcome = await publishStaticSite(deps, input);
    settleWithOutcome(startedAtIso, input.config.target, outcome, clock);
    await recordHistoryIfPublished(historyStore, input, outcome, clock, "agent_tool");
    return outcome;
  } catch (err) {
    settleWithError(startedAtIso, input.config.target, err, clock);
    throw err;
  }
}
