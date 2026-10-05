import type { PermissionGrantRegistry } from "../identity/permission-grants.js";
import { registerPermission } from "@jini-ai/user-management";

/**
 * @file Task 9 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.2/§4 task 9.
 *
 * ## What this registers, and why by role rather than by fan-out
 *
 * `publish_content.read` and `publish_content.apply` gate the export/pull route (Task 4) and
 * the gated import ceremony (Task 7) respectively — both already reference these two strings as
 * hand-typed literals (`routes/publish-content/export.ts`, `blob-put.ts`, `blobs-probe.ts`,
 * `bundle-create.ts`, `import.ts`, and `features/publish-content/gated-hooks.ts`). Until this file
 * registers a grant, no seeded `policy_permissions` row spells either string, so every principal
 * except `owner` (which clears every gate on its `*` wildcard) is refused regardless of role — the
 * routes work TODAY only because the seeded owner's wildcard papers over the gap.
 *
 * A built-in-role grant — not a permission-migration pair — is the right mechanism here for
 * the same reason `features/pages/permissions.ts` (SPEC-047 REQ-9, the worked example this file
 * copies) ultimately landed on it over the fan-out it first tried: a fan-out is anchored on an
 * EXISTING permission a principal already holds, and there is no existing permission in this
 * workspace whose holder list already means "trusted to read/apply cross-workspace publish-content
 * data". Stating the grant directly against the built-in `admin` role needs no such anchor and
 * reaches every already-seeded workspace — including this repo's own `sites/tovu-com/content.db` —
 * on the very next boot, not only a freshly-seeded one.
 *
 * ## Why `admin`, and not `editor`
 *
 * Reading an export or applying an import can move ANY registered publish-content type's data
 * (currently `post`/`page`, per `type-registry.ts`) across workspace/instance boundaries in one
 * request, and `executeMutation()`'s restore-point capture (`gated-hooks.ts`) exists precisely
 * because an apply can be a destructive, hard-to-undo operation. That is a workspace-operator
 * capability, not ordinary day-to-day authoring — `editor` holds `content.write` for the latter and
 * gains nothing here; `viewer` holds neither today and gains nothing here either.
 *
 * ## Ordering
 *
 * Same invariant `features/pages/permissions.ts` documents: the grants below must be registered
 * before `applyBuiltinRoleGrants` (chained off `identityReady` in `features/identity/wiring.ts`)
 * reads them. They used to be module-evaluation side effects, reached because
 * `server/runtime/composition/modules/publish-content.ts` imported this module for that side effect
 * inside `composition/app.ts`'s static import graph. They are now an explicit call:
 * `server/runtime/composition/app-permission-grants.ts` invokes
 * {@link registerPublishContentPermissionGrants} on the registry every composition root passes to
 * identity wiring. The `publish.backstop` catalog entry moved into the same call, so importing this
 * module registers nothing.
 */

/**
 * Gates `GET .../publish-content/export`: read-only visibility into a workspace's exportable
 * publish-content data (post/page bodies, and any type registered later).
 *
 * Named once so the grant below and every route's hand-typed literal read the same intent, even
 * though the routes deliberately keep their own literal copies rather than importing this — see
 * `edit-html-permission.test.ts`'s `PAGES_EDIT_HTML` for why a permission test pins a literal
 * instead of importing the module under test.
 */
export const PUBLISH_CONTENT_READ_PERMISSION = "publish_content.read";

/**
 * Gates the publish-content import ceremony's plan/confirm/execute flow
 * (`routes/publish-content/import.ts`, `gated-hooks.ts`) and the blob/bundle staging routes that
 * feed it (`blob-put.ts`, `blobs-probe.ts`, `bundle-create.ts`) — the write/mutate side.
 */
export const PUBLISH_CONTENT_APPLY_PERMISSION = "publish_content.apply";

/** The manual surface additionally checks built-in role membership; a custom wildcard role
 * never qualifies, even if role.manage has written this permission into its own policy. */
export const PUBLISH_BACKSTOP_PERMISSION = "publish.backstop";
/**
 * Register publish-content's catalog entry and built-in `admin` grants (see this file's header) on
 * `required.registry`. `registerPermission` still extends `@jini-ai/user-management`'s own catalog,
 * which is that library's module singleton; it is called here, at composition, rather than on import.
 *
 * @complexity O(1).
 */
export function registerPublishContentPermissionGrants(
  required: { registry: PermissionGrantRegistry },
  _optional: Record<string, never> = {}
): void {
  registerPermission({ id: PUBLISH_BACKSTOP_PERMISSION, owner: "publish-content", description: "Send uncovered site items by hand (owner and built-in admins only)." });
  required.registry.roleGrants.register({ role: "admin", permission: PUBLISH_BACKSTOP_PERMISSION,
    reason: "Owner B1 (2026-10-04): manual publish is available only to the owner and built-in admins; every route also enforces that role boundary." });

  required.registry.roleGrants.register({
    role: "admin",
    permission: PUBLISH_CONTENT_READ_PERMISSION,
    reason:
      "publish-content (Publish Content) Task 9: reading a workspace's exportable publish-content " +
      "data is a workspace-operator capability, not ordinary authoring — editor and viewer hold " +
      "neither publish_content.read nor publish_content.apply. Stated against the built-in admin " +
      "role directly (no existing permission's fan-out reaches this) so it lands on every " +
      "already-seeded workspace, not only a freshly-seeded one — same reasoning as " +
      "features/pages/permissions.ts's pages.edit_html grant.",
  });

  required.registry.roleGrants.register({
    role: "admin",
    permission: PUBLISH_CONTENT_APPLY_PERMISSION,
    reason:
      "publish-content (Publish Content) Task 9: applying an import can move any registered " +
      "publish-content type's data across workspace/instance boundaries and is guarded by a " +
      "restore-point capture precisely because it can be destructive — a workspace-operator " +
      "capability, not ordinary authoring. See the publish_content.read grant above for why a " +
      "direct role grant, not a fan-out, is the mechanism.",
  });
}
