/**
 * @file SPEC-046 REQ-4/REQ-6 — the client half of the `client_directive` channel's shape.
 *
 * Mirrors `src/assistant/site/client-directives.ts`'s server-side `ClientDirective` type exactly
 * (same field names, same literal `kind`/`type` discriminants) — duplicated rather than imported,
 * the same tradeoff `main.tsx`'s `MOUNT_ID` and `check-bundle-mounts.mjs`'s storage-key literals
 * already make: this is a standalone Vite app (`apps/site-chat`) with no dependency on the main
 * server's `src/` tree, so there is no shared runtime module either side could import from. If the
 * two ever drift, `isPageActionDirective` below fails closed (returns `false`, directive dropped)
 * rather than crashing on an unrecognized shape — see its own doc.
 *
 * REQ-6's "the client resolves nothing" holds here structurally: every `ResolvedPublicTarget` this
 * file consumes already carries a server-computed `path` — nothing in this file, `highlight.ts`, or
 * `SiteAssistantWidget.tsx` ever constructs a URL, path, or selector from a slug or title itself.
 */

export interface ResolvedPublicTarget {
  readonly slug: string;
  readonly title: string;
  readonly path: string;
}

export type PageAction =
  | { readonly type: "navigate"; readonly target: ResolvedPublicTarget; readonly auto: boolean }
  | { readonly type: "scroll_to"; readonly target: ResolvedPublicTarget }
  | { readonly type: "highlight"; readonly target: ResolvedPublicTarget };

export type ClientDirective =
  | { readonly kind: "page_action"; readonly action: PageAction }
  /** REQ-7 extension point only. No server code constructs one yet (the public MCP-UI allowlist
   *  ships empty, SPEC-046 §8) — this widget has no runtime handling for it either; see
   *  `SiteAssistantWidget.tsx`'s directive-processing loop, which explicitly no-ops on this kind
   *  rather than guessing at Tier B redemption behavior that was never specced for the public site. */
  | { readonly kind: "ui_surface"; readonly toolId: string; readonly resource: unknown };

function isResolvedPublicTarget(value: unknown): value is ResolvedPublicTarget {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.slug === "string" && typeof v.title === "string" && typeof v.path === "string";
}

/**
 * Structural validation for one SSE `client_directive` payload — the wire boundary between this
 * bundle and the server, so treated with the same "do not trust, narrow before use" posture as any
 * other external input (a stale cached bundle talking to a newer/older server is a realistic version
 * of "untrusted" here, not just a hostile one). Only `page_action` is recognized; a `ui_surface`
 * frame (or anything unrecognized) returns `false` — this bundle has no Tier B runtime, so the safe
 * default is to drop it rather than partially act on a shape nothing here was built to execute.
 *
 * @complexity O(1) — a fixed handful of property checks.
 * @overallScore 100
 */
export function isPageActionDirective(value: unknown): value is { kind: "page_action"; action: PageAction } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "page_action" || typeof v.action !== "object" || v.action === null) return false;

  const action = v.action as Record<string, unknown>;
  if (action.type === "navigate") return isResolvedPublicTarget(action.target) && typeof action.auto === "boolean";
  if (action.type === "scroll_to" || action.type === "highlight") return isResolvedPublicTarget(action.target);
  return false;
}
