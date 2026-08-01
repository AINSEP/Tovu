import type { UUID } from "../core/ports";
import type { SettingsRepoPort } from "../features/settings/ports";
import { getEffective, invalidateWorkspaceValueCache } from "../features/settings/settings";
import { INSTRUCTIONS_NAMESPACE } from "../features/settings/ui-tab-definitions";

/**
 * @file The read half of the admin Instructions tab's system-prompt seam: turns the stored
 * `core.instructions.custom` value into text `agent-daemon-server.ts`'s `PromptAugmenter.
 * systemOverlay()` hands the spawned agent CLI. Before this file, the setting had zero consumers —
 * an operator could type instructions, watch them persist, and nothing about the assistant's
 * behavior would change (see `agent-daemon-server.ts`'s module doc for why the daemon process,
 * not Tovu's main process, is where a system prompt gets assembled at all).
 *
 * Two problems this file exists to solve — "read the ledger value" on its own is not one of them:
 *
 * 1. CROSS-PROCESS CACHE STALENESS. `getEffective` (`features/settings/settings.ts`) caches its
 *    per-layer reads in a `WeakMap` keyed by JS object identity of the `SettingsRepoPort` passed to
 *    it, invalidated only by a `set()` call against that SAME instance. The admin's settings-dialog
 *    write happens in Tovu's MAIN process, against ITS OWN repo instance. This daemon process opens
 *    a second, independent connection to the same SQLite file (`agent-daemon-server.ts`'s module
 *    doc) with its own repo instance, and therefore its own cache that the main process's write can
 *    never invalidate. Without `invalidateWorkspaceValueCache` below, the first read in this process
 *    would cache forever: an operator's first saved instructions would take effect, and no edit
 *    after that ever would, short of restarting the daemon. `resolveCustomInstructions` invalidates
 *    immediately before every read so each call is a real (cheap: one row) SQLite read rather than a
 *    silently stale one.
 *
 * 2. THE SYNCHRONOUS SEAM. `PromptAugmenter.systemOverlay()` (`@jini-ai/agent-runtime`) returns
 *    `string | null`, not a `Promise` — `@jini-ai/daemon`'s `AgentExecutor` calls it once per
 *    `run()`, synchronously, while building the spawned CLI's argv. An async ledger read cannot
 *    happen inside that call. `createCustomInstructionsCache` bridges the gap the only way the
 *    synchronous contract allows: hold the last successfully resolved value in memory, let the
 *    caller refresh it on its own async schedule (`agent-daemon-server.ts` refreshes once per run,
 *    before starting the agent), and let `systemOverlay()` read the cache synchronously.
 */

const CUSTOM_INSTRUCTIONS_KEY = "custom";

export interface ResolveCustomInstructionsDeps {
  settingsRepo: SettingsRepoPort;
  /**
   * Resolves once boot-time definition registration for `core.instructions.*`
   * (`RouteDeps.settingsUiTabsReady`) completes. Awaited before every read so a read that races
   * boot reads as "not yet registered" (falls through to `""`) rather than being misinterpreted —
   * the same discipline `RouteDeps.settingsReady`'s own doc requires of every settings consumer.
   * Optional so a test that registers definitions itself before calling in doesn't need to thread a
   * dummy resolved promise through.
   * @default Promise.resolve()
   */
  settingsReady?: Promise<void>;
}

export interface ResolveCustomInstructionsInput {
  workspaceId: UUID;
}

/**
 * Reads `core.instructions.custom` fresh from the ledger for one workspace. See this file's header
 * for why "fresh" needs a forced cache invalidation first.
 *
 * FAILS OPEN: any error (a repo I/O failure, `settingsReady` rejecting, a malformed stored value) is
 * logged and reads as `""` — a broken settings read must degrade the assistant to "no custom
 * instructions", never block a run from starting at all. This restates, at the one call site here
 * that cannot assume it, `getEffective`'s own documented "total, never throws" contract — the
 * evaluator logic above the repo is exempt from throwing; the repo's actual I/O underneath it is not.
 *
 * @complexity O(1) — one cache invalidation, one `getEffective` resolution.
 * @overallScore 100
 */
export async function resolveCustomInstructions(
  deps: ResolveCustomInstructionsDeps,
  input: ResolveCustomInstructionsInput,
): Promise<string> {
  try {
    await (deps.settingsReady ?? Promise.resolve());
    invalidateWorkspaceValueCache(deps.settingsRepo, input.workspaceId, INSTRUCTIONS_NAMESPACE);
    const resolved = await getEffective(
      { repo: deps.settingsRepo },
      {
        namespace: INSTRUCTIONS_NAMESPACE,
        key: CUSTOM_INSTRUCTIONS_KEY,
        scopeContext: { workspaceId: input.workspaceId },
      },
    );
    return typeof resolved?.value === "string" ? resolved.value : "";
  } catch (error) {
    console.error("[assistant] resolveCustomInstructions failed; treating as unset", error);
    return "";
  }
}

const CUSTOM_INSTRUCTIONS_OVERLAY_HEADER =
  "The site operator has configured the following custom instructions for this assistant. Follow " +
  "them in addition to your default behavior, and defer to them if they conflict with it:";

/**
 * Formats a raw `core.instructions.custom` value as a `PromptAugmenter.systemOverlay()` block, or
 * `null` for empty/whitespace-only text — matching that seam's own "if non-null" contract
 * (`@jini-ai/agent-runtime`'s `prompt-augmenter.ts`) so an operator who has never set instructions
 * (or has cleared them back to the tab's empty-textarea default) gets byte-identical behavior to
 * before this file existed.
 *
 * @complexity O(n) in the length of `customInstructions` — one trim, one length check.
 * @overallScore 100
 */
export function formatCustomInstructionsOverlay(customInstructions: string): string | null {
  const trimmed = customInstructions.trim();
  return trimmed.length === 0 ? null : `${CUSTOM_INSTRUCTIONS_OVERLAY_HEADER}\n\n${trimmed}`;
}

export interface CustomInstructionsCache {
  /**
   * Re-resolves `core.instructions.custom` and updates what `readOverlay()` returns next. Never
   * rejects — inherits `resolveCustomInstructions`'s fail-open contract.
   */
  refresh(): Promise<void>;
  /**
   * Synchronous read of the last successfully refreshed value, formatted per
   * `formatCustomInstructionsOverlay`. `null` before the first `refresh()` ever resolves, which is
   * indistinguishable from "no custom instructions set" — the only value `systemOverlay()`'s
   * synchronous contract allows before any async read has had a chance to complete.
   */
  readOverlay(): string | null;
}

/**
 * The synchronous-read bridge this file's header describes. `agent-daemon-server.ts` constructs one
 * instance for its single workspace, calls `refresh()` once per run start (before starting the
 * agent, so the read is never older than "as of this conversation turn"), and wires `readOverlay`
 * into `PromptAugmenter.systemOverlay()`.
 *
 * @complexity O(1) to construct; `refresh()` is `resolveCustomInstructions`'s O(1).
 * @overallScore 100
 */
export function createCustomInstructionsCache(
  deps: ResolveCustomInstructionsDeps,
  input: ResolveCustomInstructionsInput,
): CustomInstructionsCache {
  let latest = "";
  return {
    async refresh() {
      latest = await resolveCustomInstructions(deps, input);
    },
    readOverlay() {
      return formatCustomInstructionsOverlay(latest);
    },
  };
}
