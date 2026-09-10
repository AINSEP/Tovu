import { registerPermissionMigration } from "@jini-ai/cms/identity";

import { registerBuiltinRoleGrant } from "./builtin-role-grants.js";

/**
 * @file The `admin.security.tokens.manage` permission, and the grants that make it real —
 * gates the admin Security page's "Site Token" tab (view/generate the
 * `TOVU_INTEGRATIONS_ROOT_KEY` root key, `features/webhooks/keyring.env.ts`'s
 * `inspectRootKeyMaterial`/`generateFileRootKey`).
 *
 * ## Why its own permission, not an identity check
 *
 * The owner explicitly rejected gating this on "is the workspace creator" — identity checks do
 * not compose with roles (a second admin the owner adds could never manage the root key, and
 * there is no way to delegate it short of sharing the owner's own login). A permission composes
 * the normal way: any role — built-in or custom — can be granted it.
 *
 * ## Why its own string, not reusing `admin.integrations.manage`
 *
 * `admin.integrations.manage` gates a saved CONNECTION's config (OAuth connector settings,
 * webhooks). The root key is a different order of sensitivity — it is the one thing that
 * DECRYPTS every sealed credential this install holds, including everything
 * `admin.integrations.manage` already protects. Collapsing the two would mean any future,
 * narrower grant of connector-config access silently also grants root-key control, which is not
 * a decision this file gets to make on that permission's behalf.
 *
 * ## The two grants below, same shape as `features/pages/permissions.ts`'s
 * `pages.edit_html` (see that file's own header for the full reasoning this mirrors)
 *
 * - `registerPermissionMigration({ from: "admin.integrations.manage", to: [...] })` reaches any
 *   workspace whose `admin` policy already holds `admin.integrations.manage` — every FRESHLY
 *   seeded workspace, since `@jini-ai/cms`'s `BUILTIN_ADMIN_PERMISSIONS` includes it.
 * - `registerBuiltinRoleGrant({ role: "admin", ... })` states the same intent directly against
 *   the role, so a workspace seeded before `admin.integrations.manage` existed (this repo's own
 *   installs may be exactly that, per `pages/permissions.ts`'s own account of `sites/tovu-com/
 *   content.db`) still reaches `admin` even though the migration's `from` row is absent there.
 *
 * `owner` needs neither: `authorize()` short-circuits on its `*` wildcard before ever looking for
 * a matching `policy_permissions` row. `editor`/`viewer` get neither grant, deliberately — this
 * is a narrower trust boundary than ordinary content admin.
 *
 * ## Ordering
 *
 * Both registrations below are module-evaluation side effects and must run before
 * `migrateDeprecatedPermissionGrants`/`applyBuiltinRoleGrants` do. They do, by ES module
 * semantics: {@link SITE_TOKEN_MANAGE_PERMISSION} is imported by `server/inbound/admin-http/
 * routes/system/site-token.ts`, which is in the static import graph of `composition/app.ts` (the
 * route registration call site) — the same "reached via its own consumer" mechanism
 * `pages/permissions.ts` documents for itself.
 */

/**
 * The permission required to read root-key status or generate a key file, at every sink that can
 * do either. Named once and imported by the route so the gate and the 403 body cannot drift apart.
 */
export const SITE_TOKEN_MANAGE_PERMISSION = "admin.security.tokens.manage";

/** See this file's header — the anchor an already-seeded workspace's `admin` policy is most
 *  likely to already hold. Spelled as a literal, not imported: it is a `policy_permissions` row
 *  value seeded by `@jini-ai/cms`, not a value this repo owns (same reasoning `pages/
 *  permissions.ts`'s own `DERIVED_FROM_PERMISSION` gives). */
const DERIVED_FROM_PERMISSION = "admin.integrations.manage";

registerPermissionMigration({
  from: DERIVED_FROM_PERMISSION,
  to: [SITE_TOKEN_MANAGE_PERMISSION],
  reason:
    "The admin Security page's Site Token tab reads/generates the TOVU_INTEGRATIONS_ROOT_KEY " +
    "root key — the key that decrypts every sealed credential this install holds, including " +
    "every connection admin.integrations.manage already protects. Every principal already " +
    "trusted with integration connection config inherits root-key management too.",
});

registerBuiltinRoleGrant({
  role: "admin",
  permission: SITE_TOKEN_MANAGE_PERMISSION,
  reason:
    "The built-in admin role manages the root key that decrypts every sealed credential this " +
    "install holds; editor and viewer do not. Stated directly against the role, not only via the " +
    "admin.integrations.manage migration above, because that migration only reaches a workspace " +
    "whose admin policy already HOLDS admin.integrations.manage — a workspace seeded before that " +
    "permission existed never will (seedIdentity early-returns once an owner user exists).",
});
