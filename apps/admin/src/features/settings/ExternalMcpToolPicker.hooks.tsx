import { useMemo } from "react";

import type { Translate } from "@/lib/dictionary-translator";
import { buildAgentListHandles } from "@/lib/agent-list-handles";
import { interpolate } from "@/lib/template-i18n";

import { isToolRowLocked, type ToolPickerRow } from "./external-mcp-tool-picker-rules";

/**
 * @file `ExternalMcpToolPicker.tsx`'s own derived-value logic, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` pattern (admin TSX-logic-sweep, 2026-09-05) — this repo's rule
 * that a `.tsx` file carries no functions or derived logic of its own.
 *
 * Every string below is passed through `t` as its own key, against the dictionary Phase 2C already
 * translated into 21 locales for this exact component (`external-mcp-i18n.ts`). A string IS its key
 * in this codebase, so the wording here is not editorial — changing a character silently drops the
 * entry back to English everywhere.
 */

/** The picker's own agent-handle base for one card — `mcp-server-<id>-tools`, derived from the
 *  card's own base so the two never collide and an agent reading `page.find_elements` sees one
 *  obvious namespace per server. Mirrors `@jini-ai/ui`'s `sourceConfigActionHandle` scheme
 *  (`<base>-<action>`) without importing a function that package does not export to hosts. */
export function toolPickerHandle(cardHandle: string): string {
  return `${cardHandle}-tools`;
}

/**
 * One distinct, stable handle per rendered row, positionally aligned with `rows`.
 *
 * Keyed on each tool's own remote name rather than its index, so an agent addresses the same tool
 * after a re-probe reorders the list — the same policy `buildExternalMcpCardHandles` applies to the
 * cards themselves, delegated to the same `@jini-ai/agentic` implementation so the uniqueness rules
 * cannot drift apart. Memoized because a 101-row list rebuilds this on every keystroke otherwise.
 *
 * @complexity See `buildAgentListHandles`.
 */
export function useToolRowHandles(base: string, rows: readonly ToolPickerRow[]): string[] {
  const names = rows.map((row) => row.remoteName);
  // `names` is rebuilt every render by design (the `.map()` above); the join is the stable
  // identity that should actually gate the recompute, so it — not the array itself — is the
  // dependency. No `eslint-disable` needed: this repo's config sets `noInlineConfig`, which makes
  // an inline disable comment silently ineffective (confirmed: `react-hooks/exhaustive-deps` does
  // not flag this line either way), so a disable comment here would only be misleading.
  return useMemo(() => buildAgentListHandles(base, names), [base, names.join(" ")]);
}

/** What the SERVER declared about one tool, as badges. Never a "safe" or "read-only" badge: the
 *  only positive thing a remote can say is silence-shaped, and `AdminRemoteToolSurfaceEntry`'s own
 *  doc makes "MUST NOT be rendered as read-only" a hard rule for `hintsAbsent`. So the three badges
 *  are the three things worth warning about, and a genuinely declared read-only tool gets none —
 *  its unremarkable row IS the statement.
 *
 *  @complexity O(1). */
export function describeToolRowBadges(row: ToolPickerRow, t: Translate): string[] {
  if (row.kind === "absent") return [t("This server does not offer a tool by that name.")];
  const badges: string[] = [];
  if (row.destructiveDeclared) badges.push(t("Destructive"));
  if (row.writeDeclared) badges.push(t("Writes"));
  if (row.hintsAbsent) badges.push(t("The server does not say what this tool does."));
  return badges;
}

/** The sentence explaining why a row cannot be ticked, or `null` when it can. Only one case exists
 *  in this slice (INV-003 / D-1), and its copy is already translated — see
 *  `external-mcp-tool-picker-rules.ts`'s header for why this is a lock rather than a default.
 *
 *  @complexity O(1). */
export function describeToolRowLock(row: ToolPickerRow, t: Translate): string | null {
  if (!isToolRowLocked(row)) return null;
  return t("The server marks this tool as destructive. Tovu does not enable destructive external tools.");
}

/** The "N of M enabled" line, or the stronger zero-state sentence when this connection would
 *  contribute nothing at all. Both keys shipped in Phase 2C; the zero case is called out separately
 *  because a connection that is configured but grants nothing looks identical to a working one at a
 *  glance, which is the same class of quiet failure as an inert write grant.
 *
 *  @complexity O(1). */
export function describeToolCount(enabled: number, total: number, t: Translate): string {
  if (enabled === 0) return interpolate(t("0 of {total} tools enabled — this connection contributes nothing"), { total });
  return interpolate(t("{enabled} of {total} tools enabled"), { enabled, total });
}
