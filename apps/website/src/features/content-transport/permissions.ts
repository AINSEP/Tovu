import { registerBuiltinRoleGrant } from "../identity/builtin-role-grants.js";

/**
 * @file Task 9 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.2/§4 task 9.
 *
 * ## What this registers, and why by role rather than by fan-out
 *
 * `content.transport.read` and `content.transport.apply` gate the export/pull route (Task 4) and
 * the gated import ceremony (Task 7) respectively — both already reference these two strings as
 * hand-typed literals (`routes/content-transport/export.ts`, `blob-put.ts`, `blobs-probe.ts`,
 * `bundle-create.ts`, `import.ts`, and `features/content-transport/gated-hooks.ts`). Until this file
 * registers a grant, no seeded `policy_permissions` row spells either string, so every principal
 * except `owner` (which clears every gate on its `*` wildcard) is refused regardless of role — the
 * routes work TODAY only because the seeded owner's wildcard papers over the gap.
 *
 * `registerBuiltinRoleGrant` — not `registerPermissionMigration` — is the right mechanism here for
 * the same reason `features/pages/permissions.ts` (SPEC-047 REQ-9, the worked example this file
 * copies) ultimately landed on it over the fan-out it first tried: a fan-out is anchored on an
 * EXISTING permission a principal already holds, and there is no existing permission in this
 * workspace whose holder list already means "trusted to read/apply cross-workspace content
 * transport". Stating the grant directly against the built-in `admin` role needs no such anchor and
 * reaches every already-seeded workspace — including this repo's own `sites/tovu-com/content.db` —
 * on the very next boot, not only a freshly-seeded one.
 *
 * ## Why `admin`, and not `editor`
 *
 * Reading an export or applying an import can move ANY registered content-transport type's data
 * (currently `post`/`page`, per `type-registry.ts`) across workspace/instance boundaries in one
 * request, and `executeMutation()`'s restore-point capture (`gated-hooks.ts`) exists precisely
 * because an apply can be a destructive, hard-to-undo operation. That is a workspace-operator
 * capability, not ordinary day-to-day authoring — `editor` holds `content.write` for the latter and
 * gains nothing here; `viewer` holds neither today and gains nothing here either.
 *
 * ## Ordering
 *
 * Same invariant `features/pages/permissions.ts` documents: this module's `registerBuiltinRoleGrant`
 * calls are module-evaluation side effects, and must run before `applyBuiltinRoleGrants` (chained
 * off `identityReady` in `features/identity/wiring.ts`) reads the registry. They do, by ES module
 * semantics — `server/runtime/composition/modules/content-transport.ts` imports this module for that
 * side effect, and it sits in the static import graph of `server/runtime/composition/app.ts`, which
 * is fully evaluated before `createApp()` ever calls `createSqliteIdentityRouteDeps`/
 * `createInMemoryIdentityRouteDeps` and kicks off the seed promise this chains off.
 */

/**
 * Gates `GET .../content-transport/export`: read-only visibility into a workspace's exportable
 * content-transport data (post/page bodies, and any type registered later).
 *
 * Named once so the grant below and every route's hand-typed literal read the same intent, even
 * though the routes deliberately keep their own literal copies rather than importing this — see
 * `edit-html-permission.test.ts`'s `PAGES_EDIT_HTML` for why a permission test pins a literal
 * instead of importing the module under test.
 */
export const CONTENT_TRANSPORT_READ_PERMISSION = "content.transport.read";

/**
 * Gates the content-transport import ceremony's plan/confirm/execute flow
 * (`routes/content-transport/import.ts`, `gated-hooks.ts`) and the blob/bundle staging routes that
 * feed it (`blob-put.ts`, `blobs-probe.ts`, `bundle-create.ts`) — the write/mutate side.
 */
export const CONTENT_TRANSPORT_APPLY_PERMISSION = "content.transport.apply";

registerBuiltinRoleGrant({
  role: "admin",
  permission: CONTENT_TRANSPORT_READ_PERMISSION,
  reason:
    "content-transport (Publish Content) Task 9: reading a workspace's exportable content-transport " +
    "data is a workspace-operator capability, not ordinary authoring — editor and viewer hold " +
    "neither content.transport.read nor content.transport.apply. Stated against the built-in admin " +
    "role directly (no existing permission's fan-out reaches this) so it lands on every " +
    "already-seeded workspace, not only a freshly-seeded one — same reasoning as " +
    "features/pages/permissions.ts's pages.edit_html grant.",
});

registerBuiltinRoleGrant({
  role: "admin",
  permission: CONTENT_TRANSPORT_APPLY_PERMISSION,
  reason:
    "content-transport (Publish Content) Task 9: applying an import can move any registered " +
    "content-transport type's data across workspace/instance boundaries and is guarded by a " +
    "restore-point capture precisely because it can be destructive — a workspace-operator " +
    "capability, not ordinary authoring. See the content.transport.read grant above for why a " +
    "direct role grant, not a fan-out, is the mechanism.",
});
