/**
 * @file Client-side permission-affordance helper.
 *
 * Purpose:
 * `GET /auth/me`'s `effectivePermissions` field is `identity/auth-service.ts`'s
 * `getEffectivePermissions()` output: a flat, deduplicated array of permission strings that
 * includes the literal `"*"` when the caller holds an unconstrained owner grant (ADR-021 §2's
 * "owner wildcard", `identity/authorize.ts`'s `hasUnconstrainedWildcard`). That flattening drops
 * each row's `resourceType`/`constraintJson` — the client only ever sees bare permission strings.
 *
 * A plain `permissions.includes(permission)` check treats `"*"` as just another permission name
 * and never matches it against a real permission like `"comments.read"` — that is what locked
 * the workspace owner out of every permission-gated affordance in `Settings.tsx` and
 * `Comments.tsx` (both of which had that exact `.includes()` check inlined per-component before
 * this file existed). `hasPermission()` special-cases the wildcard exactly once so every call
 * site gets it for free.
 *
 * This is UX-only affordance-hiding, not the authz boundary itself — `Settings.tsx`'s and
 * `Comments.tsx`'s own header notes already say so. The real boundary is
 * `identity/authorize.ts`'s `authorize()`, evaluated server-side on every mutation and tool call;
 * it already special-cases the wildcard correctly (that evaluator was never the bug). Every
 * client call site that checks a permission string against `effectivePermissions` should route
 * through this helper instead of reintroducing a literal `.includes()`.
 *
 * NOT A SECURITY BOUNDARY (ADR-006 — one evaluator): this function only decides whether a
 * button, section, or form renders. It never runs on the server and is never consulted by any
 * route or command handler. A bug in `hasPermission()` — wrong or missing, too permissive or too
 * restrictive — can only show or hide a control; it cannot grant or block the underlying
 * operation, because every mutation and tool call is independently re-checked server-side by
 * `authorize()` in `src/identity/authorize.ts`. Do not import this into server code, and do not
 * treat a passing call here as proof an action is actually allowed.
 */

/**
 * True iff `permissions` grants `permission` — either an exact match, or the unconstrained owner
 * wildcard `"*"` (mirrors `identity/authorize.ts`'s server-side wildcard precedence, minus the
 * `resourceType`/`constraintJson` re-check that function does: that data never reaches the
 * client, since `getEffectivePermissions` already collapses each row to its bare permission
 * string before this list is sent).
 *
 * @complexity O(n) array scan, n = `permissions.length` (a handful of grant strings for a real
 * principal; never a caller-unbounded collection).
 */
export function hasPermission(permissions: readonly string[], permission: string): boolean {
  return permissions.includes("*") || permissions.includes(permission);
}
