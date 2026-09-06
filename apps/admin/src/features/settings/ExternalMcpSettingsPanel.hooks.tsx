import type { SourceConfigItem } from "@jini-ai/ui";

import { buildExternalMcpCardHandles } from "./rules";

/**
 * @file `ExternalMcpSettingsPanel.tsx`'s own derived-value logic, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` pattern `TabBar.tsx`/`TabBar.hooks.tsx` establishes (admin
 * TSX-logic-sweep, 2026-09-05) — this repo's rule that a `.tsx` file carries no functions or derived
 * logic of its own.
 */

/** `ExternalMcpSettingsPanel`'s own per-card agent handles. Not `useMemo`'d: an O(n) pass (see
 *  `buildAgentListHandles`'s own `@complexity` doc, which `buildExternalMcpCardHandles` wraps) over
 *  one workspace's own configured external MCP servers — small and cheap enough next to the render
 *  it feeds that memoizing it was not judged worth the added indirection. That is a decision about
 *  memoization, separate from why this now lives outside the component body at all (the
 *  `.tsx` bodies carry no derived logic). */
export function resolveExternalMcpCardHandles(sources: readonly SourceConfigItem[]): string[] {
  return buildExternalMcpCardHandles(sources.map((source) => source.id));
}
