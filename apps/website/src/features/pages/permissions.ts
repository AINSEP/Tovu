import { registerPermissionMigration } from "@jini-ai/cms/identity";

/**
 * @file SPEC-047 REQ-9 — the `pages.edit_html` permission, and the grant that makes it real.
 *
 * ## What this gates and why it is its own permission
 *
 * Writing a Page's bespoke HTML body stores unsanitized markup that renders into the public site.
 * That is the feature working as designed, not a defect: Pages exist so an operator (or the
 * assistant on their behalf) can author arbitrary markup, and sanitizing it away would delete the
 * capability rather than secure it. The published page is not sandboxed, so the write is in practice
 * a "run script in every visitor's browser" capability.
 *
 * REQ-9's reasoning is that this belongs next to `theme.edit`, not next to `content.write`: both
 * author raw source that the site renders, and both fail as a broken or hostile artifact rather than
 * as a wrong-looking content edit. `content.write` is ordinary authoring, and the built-in `editor`
 * role holds it.
 *
 * ## Why a migration, and not a line in the seed
 *
 * `seedIdentity` (`@jini-ai/cms`) early-returns the moment an owner user exists, so its built-in
 * grant lists only ever reach a FRESH workspace. Every already-seeded install — including this
 * repo's own `content.db` — can gain a new grant only through `migrateDeprecatedPermissionGrants`,
 * which runs on every boot from `features/identity/wiring.ts` and is additive-only and idempotent.
 * Adding the string to the library's seed list would therefore be the one change that provably does
 * NOT fix any existing installation.
 *
 * ## Why this is not blocked on the `@jini-ai/cms` repo
 *
 * Both this route's header and `tool-registrations.ts` previously recorded REQ-9 as blocked outside
 * this repository, on the reasoning that `authorize()` matches literal `policy_permissions` rows and
 * the seed that would create one lives in the library. The first half is true; the conclusion was
 * not. `registerPermissionMigration` is exported to hosts from `@jini-ai/cms/identity` precisely so
 * a host can add its own pair (the library's own `identity/index.ts` says so), and the boot-time
 * fan-out that consumes the registry already lives in THIS repo. No library change is needed.
 *
 * ## Why `theme.edit` is the right `from`
 *
 * The fan-out grants `to` to every policy already holding `from`, so `from` is the thing that
 * decides who ends up with the new capability. Against the four built-in roles:
 *
 * - `admin` holds `theme.edit` and gains `pages.edit_html`. Intended: REQ-9 wants admin to keep it.
 * - `editor` does NOT hold `theme.edit` — the seed excludes it deliberately, with the same
 *   broken-artifact argument REQ-9 makes — so it does not gain `pages.edit_html`. This is the whole
 *   point of the change.
 * - `viewer` holds neither.
 * - `owner` holds only the `*` wildcard, so no row is added to its policy and none is needed:
 *   `authorize()` short-circuits on the wildcard before it ever looks for a matching row.
 *
 * A hand-built custom policy holding `theme.edit` also gains it, which is the correct reading of
 * "this operator was trusted with raw theme source".
 *
 * Using a live permission as `from` is established here rather than novel: the catalog's
 * `settings.user.write -> settings.user.read` pair does exactly this and says so in its own reason
 * string ("Unlike this file's other pairs, `from` is not deprecated — it stays live for writes").
 * `theme.edit` is likewise untouched — the fan-out never removes or rewrites a `from` row.
 *
 * ## Ordering
 *
 * The registration below is a module-evaluation side effect, and it must happen before
 * `migrateDeprecatedPermissionGrants` runs. It does, by ES module semantics rather than by luck:
 * both consumers of {@link PAGES_EDIT_HTML_PERMISSION} (`routes/pages/update-html.ts` and
 * `features/pages/tool-registrations.ts`) are in the static import graph of the composition roots
 * that call `createSqliteIdentityRouteDeps`/`createInMemoryIdentityRouteDeps`, so this module is
 * fully evaluated before any composition-root code runs, let alone before the seed promise it
 * chains off resolves. `edit-html-permission.test.ts` pins the resulting grant end-to-end, so a
 * regression in that ordering surfaces as a failing privilege test rather than as a silent
 * fail-open.
 */

/**
 * The permission required to write a Page's bespoke HTML body, at every sink that can do so.
 *
 * Named once and imported by both writers so the gate and the 403/refusal body cannot drift apart.
 * The tests that certify it deliberately hand-type the literal instead of importing this — see
 * `pages-update-html-auth.test.ts`'s `LITERAL_PERMISSION` for why.
 */
export const PAGES_EDIT_HTML_PERMISSION = "pages.edit_html";

/**
 * The existing permission whose holders inherit {@link PAGES_EDIT_HTML_PERMISSION}.
 *
 * Spelled as a literal rather than imported from `features/theme`: this is a `policy_permissions`
 * row value seeded by `@jini-ai/cms`, not a value this repo owns, and a cross-feature import would
 * imply a coupling that does not exist. `features/theme/agent-tools.ts`'s `THEME_WRITE_PERMISSION`
 * holds the same literal for the same reason.
 */
const DERIVED_FROM_PERMISSION = "theme.edit";

registerPermissionMigration({
  from: DERIVED_FROM_PERMISSION,
  to: [PAGES_EDIT_HTML_PERMISSION],
  reason:
    "SPEC-047 REQ-9: writing a Page's bespoke HTML body stores unsanitized markup that renders into " +
    "the public site, so it is gated on its own pages.edit_html rather than on content.write, which " +
    "the built-in editor role holds. Every principal already trusted with raw theme source " +
    "(theme.edit) inherits it, which is exactly the admin-not-editor split REQ-9 asks for. Unlike " +
    "this mechanism's rename pairs, `from` is not deprecated — theme.edit stays live and untouched " +
    "(the fan-out is additive-only); it is used here as the trust anchor, following the " +
    "settings.user.write -> settings.user.read precedent.",
});
