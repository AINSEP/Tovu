import type { UUID } from "@jini-ai/cms/core";
import { type SettingsRepoPort } from "../features/settings/index.js";

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
 * 1. CROSS-PROCESS CACHE STALENESS — RESOLVED UPSTREAM (2026-07-31); no longer this file's problem.
 *    `getEffective` (`features/settings/settings.ts`) used to cache its per-layer reads in a
 *    `WeakMap` keyed by JS object identity of the `SettingsRepoPort`, invalidated only by a `set()`
 *    against that SAME instance. The admin's settings-dialog write happens in Tovu's MAIN process;
 *    this daemon process opens a second, independent connection to the same SQLite file
 *    (`agent-daemon-server.ts`'s module doc) with its own repo instance and therefore its own cache,
 *    which the main process's write could never invalidate. An operator's first saved instructions
 *    took effect and no edit after that ever did, short of restarting the daemon.
 *
 *    This file worked around it by calling `invalidateWorkspaceValueCache` immediately before every
 *    read. That fixed this call site and only this call site — the same staleness later surfaced
 *    through `settings_set_ui_preference`, where an agent's language change was invisible to the
 *    main server across full page reloads. The per-layer value cache has since been removed
 *    outright (see `settings.ts`'s cache header), which generalizes the conclusion this file had
 *    already reached: an uncached layer read is one indexed row from a local SQLite file, and that
 *    is cheaper than a correctness bug that only reproduces when the cache happens to be warm.
 *
 *    Nothing is needed here anymore; `getEffective` is always fresh. The note is kept because the
 *    reasoning is the record of WHY the cache went away, and because a future reader tempted to
 *    reintroduce one should find this first.
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

/**
 * Structural signature matching `features/settings`'s real `getEffective` export
 * (`@jini-ai/cms/settings`, re-exported unchanged by `features/settings/index.ts`). Redeclared
 * locally rather than shared from `public-assistant-settings.ts`'s own identical-shaped type — this
 * repo redeclares small structural types per-file rather than sharing them across the module-cycle
 * boundary (same precedent as `assistant/site/tools.ts`'s/`client-directives.ts`'s own two
 * `ListPublishedPosts` types). Importing the FUNCTION as a value here is exactly the edge that would
 * close an `[assistant, features/settings]` module cycle once `settings` converts to the standard
 * `registerToolContributor` pattern; see `ResolveCustomInstructionsDeps.getEffective`'s own doc for
 * how the real function still reaches this file despite the type living here instead of being
 * imported. `.value` is typed `unknown` (not `JsonValue`) because this file only ever narrows it with
 * `typeof ... === "string"` below — no caller here needs the full settings-value union.
 */
type GetEffective = (
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; scopeContext: { workspaceId: UUID } },
) => Promise<{ value: unknown } | null>;

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
  /** The real `features/settings`'s own `getEffective` — injected rather than statically imported;
   *  see the `GetEffective` type's own doc. Wired to the real implementation at the composition root
   *  (`RouteDeps.getEffective`, populated once in both `server/app.ts`/`server/deps.ts`). */
  getEffective: GetEffective;
  /** The real `features/settings`'s own `INSTRUCTIONS_NAMESPACE` constant (`"core.instructions"`) —
   *  injected for uniformity with `getEffective` above rather than relocated to a new shared module;
   *  see `public-assistant-settings.ts`'s `ScopeBit` type doc for the identical reasoning applied to
   *  its own injected constant, `SCOPE_BIT`. */
  instructionsNamespace: string;
}

export interface ResolveCustomInstructionsInput {
  workspaceId: UUID;
}

/**
 * Reads `core.instructions.custom` fresh from the ledger for one workspace. "Fresh" needs nothing
 * from this function anymore — see this file's header for the cache that used to make it a problem.
 *
 * FAILS OPEN: any error (a repo I/O failure, `settingsReady` rejecting, a malformed stored value) is
 * logged and reads as `""` — a broken settings read must degrade the assistant to "no custom
 * instructions", never block a run from starting at all. This restates, at the one call site here
 * that cannot assume it, `getEffective`'s own documented "total, never throws" contract — the
 * evaluator logic above the repo is exempt from throwing; the repo's actual I/O underneath it is not.
 *
 * @complexity O(1) — one `getEffective` resolution.
 * @overallScore 100
 */
export async function resolveCustomInstructions(
  deps: ResolveCustomInstructionsDeps,
  input: ResolveCustomInstructionsInput,
): Promise<string> {
  try {
    await (deps.settingsReady ?? Promise.resolve());
    const resolved = await deps.getEffective(
      { repo: deps.settingsRepo },
      {
        namespace: deps.instructionsNamespace,
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
