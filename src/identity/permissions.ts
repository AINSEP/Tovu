/**
 * @file The registered permission catalog (REQ-03/REQ-12).
 *
 * Purpose:
 * Permissions are flat dotted strings validated against a code-side
 * registered catalog, not a DB enum (REQ-03) — the anti-hook-soup rule
 * (ADR-005/SPEC-005) applied to authZ. Core owns the base vocabulary;
 * features may register more at startup.
 *
 * Scope note (core path, this pass): the CLI surface `tovu permissions list`
 * (REQ-12) has no reachable caller — this server has no CLI surface (see the
 * Programmer handoff, mirrors the REQ-13 N/A reasoning). `listPermissions()`
 * is the core capability a future CLI wires to; it is exercised directly by
 * tests instead.
 *
 * ADR-PIPE-012 (Menus remediation, D-1/D-2/D-9): `navigation.manage` below is
 * renamed/split into the `admin.menus.*` 7-entry catalog. `navigation.manage`
 * itself stays registered (deprecated, not deleted — see its own doc comment)
 * until the Point of No Return; `permission-migrations.ts`'s
 * `migrateDeprecatedPermissionGrants()` is the fan-out mechanism that keeps
 * any policy holding the old string from being silently narrowed by the
 * split. NOTE: registration only — wiring the migration call into
 * `seed.ts`'s live boot path is gated on a real `/audit-work` pass
 * (ADR-PIPE-012 Constitution Check, security axis) and is deliberately NOT
 * done in this pass; see `seed.ts`'s own doc comment.
 */
import { registerPermissionMigration } from "./permission-migrations";

/** One entry in the registered permission catalog. */
export interface PermissionDescriptor {
  /** Dotted permission string, e.g. `"content.write"`. */
  id: string;
  /** Registering module, e.g. `"core"` or a feature name. */
  owner: string;
  description: string;
}

/** REQ-09: the base vocabulary core registers at startup. */
const BASE_CATALOG: readonly PermissionDescriptor[] = [
  { id: "content.read", owner: "core", description: "Read content entries." },
  { id: "content.write", owner: "core", description: "Create and edit content entries." },
  { id: "content.publish", owner: "core", description: "Publish/unpublish content entries." },
  { id: "content.delete", owner: "core", description: "Delete content entries." },
  {
    id: "media.write",
    owner: "core",
    description:
      "DEPRECATED (ADR-027 §7, SPEC-021 REQ-40/OQ-02) — superseded by the flat media.* permission " +
      "set registered below. Retained (not deleted) — see the media.* registration block's own " +
      "comment for the same Migration Safety gating this repo's other permission renames " +
      "(navigation.manage, integration.manage) have used. Do not register a new dependency on this string.",
  },
  { id: "theme.set", owner: "core", description: "Change the active theme/presentation settings." },
  { id: "plugin.read", owner: "core", description: "List installed plugins and their state." },
  { id: "plugin.enable", owner: "core", description: "Enable a plugin." },
  { id: "plugin.disable", owner: "core", description: "Disable a plugin." },
  { id: "changeset.read", owner: "core", description: "Read the change-set audit trail." },
  { id: "changeset.revert", owner: "core", description: "Revert an applied change set." },
  { id: "member.manage", owner: "core", description: "Manage front-end members and subscriptions." },
  { id: "user.manage", owner: "core", description: "Create/disable operator users and principals." },
  { id: "role.manage", owner: "core", description: "Manage roles, policies, and grants." },
  {
    id: "settings.write",
    owner: "core",
    description:
      "DEPRECATED (ADR-028 §7) — superseded by the fine-grained settings.* catalog below. Retained until the data migration that maps existing grants to settings.workspace.write + settings.definitions.manage completes and is verified; do not reuse this string for anything else afterward.",
  },
  { id: "apikey.manage", owner: "core", description: "Issue and revoke API keys." },
  // SPEC-007 settings.* catalog (ADR-028 §7, core-only subset).
  { id: "settings.global.write", owner: "settings", description: "Set/clear a setting's global-layer value." },
  {
    id: "settings.workspace.write",
    owner: "settings",
    description: "Set/clear a setting's workspace-layer value.",
  },
  {
    id: "settings.user.self.write",
    owner: "settings",
    description: "Set/clear a setting's own user-layer value.",
  },
  {
    id: "settings.user.write",
    owner: "settings",
    description: "Set/clear another principal's user-layer value.",
  },
  {
    id: "settings.definitions.manage",
    owner: "settings",
    description:
      "Register/rename/retype/deprecate/tombstone setting definitions; also gates the purge service and authorizes the background coerce repair job (ADR-028 §7).",
  },
  { id: "settings.reset.global", owner: "settings", description: "Reset a namespace's global-layer values to defaults." },
  {
    id: "settings.reset.workspace",
    owner: "settings",
    description: "Reset a namespace's workspace-layer values to defaults.",
  },
  { id: "settings.reset.user", owner: "settings", description: "Reset a namespace's user-layer values to defaults." },
  { id: "settings.read", owner: "settings", description: "Read effective setting values (getEffective)." },
  {
    id: "settings.read.raw",
    owner: "settings",
    description: "Read per-layer raw setting values. Reserved for a future API surface (ADR-028 §7 RD2-02).",
  },
  {
    id: "settings.read.revisions",
    owner: "settings",
    description: "Read the setting_revisions ledger. Reserved for a future API surface (ADR-028 §7 RD2-02).",
  },
  {
    id: "settings.read.definitions",
    owner: "settings",
    description: "List setting definitions grouped by namespace.",
  },
] as const;

/**
 * Code-side registry backing REQ-03's catalog validation and REQ-12's
 * enumeration. `"*"` (the owner wildcard, REQ-04) is deliberately not a
 * catalog entry — it is a distinct, built-in-only grant shape checked by
 * `authorize()`/seed, never a registrable permission string.
 *
 * @complexity O(1) amortized per lookup (Map-backed); O(n) to list all.
 * @overallScore 100
 */
class PermissionCatalog {
  private readonly byId = new Map<string, PermissionDescriptor>();

  constructor(initial: readonly PermissionDescriptor[]) {
    for (const descriptor of initial) this.byId.set(descriptor.id, descriptor);
  }

  /** Idempotent: re-registering the same `id` (e.g. on a warm reload) is a no-op overwrite. */
  register(descriptor: PermissionDescriptor): void {
    this.byId.set(descriptor.id, descriptor);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  list(): PermissionDescriptor[] {
    return [...this.byId.values()];
  }
}

/** Module-singleton catalog — core's base vocabulary, extended by feature registration. */
export const permissionCatalog = new PermissionCatalog(BASE_CATALOG);

/** Register an additional permission at feature startup (REQ-03). */
export function registerPermission(descriptor: PermissionDescriptor): void {
  permissionCatalog.register(descriptor);
}

/**
 * Feature-registered permissions beyond the core BASE_CATALOG (REQ-03), added while wiring
 * `authorize()` into the admin routes for the `navigation` (ADR-029) and `integrations` (ADR-036)
 * libraries. Both ADRs' own text separately floats a namespaced `admin.<section>.manage` string in
 * a "decisions" convention note — that convention has no implementation behind it anywhere in this
 * codebase. This registers the flat two-segment `domain.verb` shape instead (ADR-021 §3's "one
 * permission language", the pattern every other catalog entry above and every currently-gated route
 * already uses) so menus/integrations authorization is checked with real, tested code rather than a
 * convention that exists only as ADR prose. See the Programmer handoff for the full disclosure.
 *
 * One permission per domain (not split into `.read`/`.write`) mirrors `member.manage`/`user.manage`
 * above — no finer split was directed, and neither library's routes distinguish read/write access
 * today.
 */
registerPermission({
  id: "navigation.manage",
  owner: "navigation",
  description:
    "DEPRECATED (ADR-PIPE-012 D-1/D-2/D-9) — superseded by the admin.menus.* catalog below. " +
    "Retained (not deleted) until the Point of No Return: the identity SQLite adapter shipping " +
    "plus a real deprecation window with observed zero reliance on this string, gated on " +
    "authorize()-decision logging existing first to measure that (ADR-PIPE-012 Migration Safety). " +
    "Do not register a new dependency on this string.",
});
/**
 * ADR-PIPE-012 D-1/D-2/D-9: the `admin.menus.*` 7-entry catalog that replaces
 * `navigation.manage` above. Split by action (force-purge is now gated
 * separately from ordinary edits — the D-1 fix) and renamed to the frozen
 * `admin.<section>.<action>` convention (`sweep-crosscutting-decisions-20260710.md`
 * §E) that `navigation.manage` predates. Values must stay in lockstep with
 * `navigation/contracts.ts`'s `NAVIGATION_PERMISSIONS`.
 */
registerPermission({
  id: "admin.menus.read",
  owner: "navigation",
  description: "Read menus and their location bindings.",
});
registerPermission({
  id: "admin.menus.create",
  owner: "navigation",
  description: "Create a new menu.",
});
registerPermission({
  id: "admin.menus.update",
  owner: "navigation",
  description: "Replace a menu's item tree.",
});
registerPermission({
  id: "admin.menus.delete",
  owner: "navigation",
  description: "Trash a menu, and attempt an ordinary (non-forced) hard purge.",
});
registerPermission({
  id: "admin.menus.delete.force",
  owner: "navigation",
  description:
    "Force-purge a menu past the dangling-location-binding guard (ADR-PIPE-012 D-1 — split from " +
    "admin.menus.delete so force-purge is not reachable with only the ordinary delete grant).",
});
registerPermission({
  id: "admin.menus.assign",
  owner: "navigation",
  description: "Assign (or reassign) a menu to a theme location.",
});
registerPermission({
  id: "admin.menus.manage",
  owner: "navigation",
  description: "Umbrella grant covering every admin.menus.* action (mirrors owner-tier convenience grants).",
});
registerPermissionMigration({
  from: "navigation.manage",
  to: [
    "admin.menus.read",
    "admin.menus.create",
    "admin.menus.update",
    "admin.menus.delete",
    "admin.menus.delete.force",
    "admin.menus.assign",
  ],
  reason:
    "ADR-PIPE-012 D-1/D-2/D-9: navigation.manage split into per-action admin.menus.* strings; " +
    "every policy holding the old flat permission must not be silently narrowed by the split.",
});
registerPermission({
  id: "integration.manage",
  owner: "integrations",
  description:
    "DEPRECATED (ADR-PIPE-015 Phase 3) — superseded by admin.integrations.manage below, " +
    "mirroring ADR-PIPE-012's navigation.manage -> admin.menus.* precedent. Retained (not " +
    "deleted) — see admin.integrations.manage's own comment for the same Migration Safety " +
    "gating this repo's other permission renames have used.",
});
/**
 * ADR-PIPE-015 Phase 3 (T027): the single umbrella permission superseding the flat
 * `integration.manage` above, renamed to the frozen `admin.<section>.<action>` convention
 * (`sweep-crosscutting-decisions-20260710.md` §E) — mirrors ADR-PIPE-012's identical
 * navigation.manage -> admin.menus.* rename. One permission (not split by action) because
 * `integration.manage` itself was never split and no finer split was directed for this pass.
 */
registerPermission({
  id: "admin.integrations.manage",
  owner: "integrations",
  description: "Create, update, pause, and delete webhook subscriptions; read delivery logs.",
});
registerPermissionMigration({
  from: "integration.manage",
  to: ["admin.integrations.manage"],
  reason:
    "ADR-PIPE-015 Phase 3: integration.manage renamed to admin.integrations.manage; every " +
    "policy holding the old flat permission must not be silently locked out by the rename.",
});
/**
 * SPEC-008 / ADR-PIPE-008 Decision §8 (T011): a single umbrella permission
 * gating all 6 SEO admin routes (both reads and writes — no self-vs-other
 * branching to get wrong, matching `theme.set`'s single-permission-per-domain
 * precedent, api.spec.md §2). Uses the frozen `admin.<section>.<action>`
 * convention directly (unlike `navigation.manage`/`integration.manage` above,
 * which predate it) — Coordinator-confirmed 2026-07-13 (state.spec.md §5 item
 * 2) as the owner-frozen shape new admin sections should register under.
 */
registerPermission({
  id: "admin.seo.manage",
  owner: "seo",
  description: "Read and write per-entry SEO overrides, site-level SEO settings, and the sitemap cache.",
});
/**
 * FEAT-014 / ADR-PIPE-014 §1: closes the standing Article VI gap on the analytics
 * `recent-hits` admin route (previously zero `authorize()` call at all). Flat
 * `domain.verb` shape, matching `navigation.manage`/`integration.manage` above rather
 * than the never-implemented `admin.analytics.view` string floated in ADR-035/ADR-INDEX
 * prose — see ADR-PIPE-014 Decision §1/Rationale for the full disclosure.
 */
registerPermission({
  id: "analytics.read",
  owner: "analytics",
  description: "Read recent ingested analytics hits.",
});
/**
 * SPEC-009 / ADR-PIPE-009 REQ-12: gates all 7 admin `redirects` endpoints
 * (list/get/create/update/tombstone/import/hit-read). Flagged deviation
 * (per spec-manifest.md, ADR-PIPE-009 File Map): this is the FIRST
 * `admin.<section>.<action>`-prefixed permission in the catalog — every
 * other entry above (`navigation.manage`, `integration.manage`,
 * `analytics.read`, ...) uses the flat `domain.verb` shape and explicitly
 * rejected the `admin.<section>.<action>` convention floated only in ADR
 * prose. This one is used exactly as SPEC-009/ADR-PIPE-009 directs, not
 * silently normalized to match the flat-string precedent — a real,
 * disclosed inconsistency in the catalog, not an oversight.
 */
registerPermission({
  id: "admin.redirects.manage",
  owner: "redirects",
  description: "Create, update, tombstone, import, and read hit stats for redirect rules.",
});
/**
 * SPEC-010 / ADR-PIPE-010 (Forms, Tier-1 sample plugin): the three `admin.forms.*` capability
 * strings, verbatim per `api.spec.md` §2 and `manifest.ts`'s `FORMS_CAPABILITIES` data. Unlike
 * `navigation.manage`/`integration.manage` above, Forms deliberately splits into three (not one
 * flat `forms.manage`) — submission data is visitor-supplied PII, so an admin who manages form
 * definitions need not automatically see or delete submission content, and vice versa (mirrors the
 * `webhooks.read` vs `webhooks.redeliver` granularity precedent in ADR-036 §6).
 */
registerPermission({
  id: "admin.forms.manage",
  owner: "forms",
  description: "Create, update, and disable/enable form definitions.",
});
registerPermission({
  id: "admin.forms.submissions.read",
  owner: "forms",
  description: "List and view form submissions.",
});
registerPermission({
  id: "admin.forms.submissions.delete",
  owner: "forms",
  description: "Permanently delete a form submission.",
});
/**
 * SPEC-011 (Newsletter, ADR-PIPE-011 REQ-25 Agent Directive, AC-42). Namespaced `admin.newsletter.*`
 * shape (unlike `navigation.manage`/`integration.manage`/`analytics.read` above) — matches
 * api.spec.md §2's per-endpoint auth-profile table exactly (8 strings actually gate a route this
 * pass) and SPEC-009's `admin.redirects.manage` naming precedent. `admin.newsletter.settings.manage`/
 * `admin.newsletter.manage` are registered but not yet gate any route — reserved for a future API
 * surface, same disclosed convention as `settings.read.raw`/`settings.read.revisions` above.
 */
registerPermission({
  id: "admin.newsletter.read",
  owner: "newsletter",
  description: "List and read newsletter campaigns, lists, and the send log.",
});
registerPermission({
  id: "admin.newsletter.campaign.compose",
  owner: "newsletter",
  description: "Create/edit/cancel a newsletter campaign in draft or scheduled state.",
});
registerPermission({
  id: "admin.newsletter.campaign.schedule",
  owner: "newsletter",
  description: "Schedule a draft newsletter campaign to send at a future time.",
});
registerPermission({
  id: "admin.newsletter.campaign.send",
  owner: "newsletter",
  description: "Send, pause, or resume a newsletter campaign — real outbound mail.",
});
registerPermission({
  id: "admin.newsletter.campaign.send_test",
  owner: "newsletter",
  description: "Send a test copy of a newsletter campaign to a small address list.",
});
registerPermission({
  id: "admin.newsletter.list.manage",
  owner: "newsletter",
  description: "Create and archive newsletter subscriber lists.",
});
registerPermission({
  id: "admin.newsletter.subscriber.read",
  owner: "newsletter",
  description: "Read newsletter subscriptions and the per-campaign send log.",
});
registerPermission({
  id: "admin.newsletter.subscriber.manage",
  owner: "newsletter",
  description: "Add, import, remove newsletter subscriptions, and resend confirmation emails.",
});
registerPermission({
  id: "admin.newsletter.settings.manage",
  owner: "newsletter",
  description: "Reserved for a future API surface (no route uses this yet).",
});
registerPermission({
  id: "admin.newsletter.manage",
  owner: "newsletter",
  description: "Umbrella newsletter permission. Reserved for a future API surface (no route uses this yet).",
});
/**
 * ADR-041 §6 (Storage/Timeline) / ADR-045 (Backups/Recovery) — the house-style flat
 * `domain.verb` permissions both ADRs' own text names directly (matching
 * `navigation.manage`/`integration.manage`/`analytics.read`'s shape, not the
 * `admin.<section>.<action>` convention). Only `storage.read` gates a route this pass
 * (`routes/admin/storage/timeline.ts`); the rest are registered now — matching this catalog's
 * existing precedent of registering a domain's full permission vocabulary even before every
 * verb has a route (e.g. `admin.newsletter.settings.manage` above) — so a future session wiring
 * the remaining Storage/Recovery routes need not touch this file again.
 */
registerPermission({ id: "storage.read", owner: "storage", description: "Read the Storage Timeline, schema drift status, and restore points." });
/** ADR-046 Phase 2 (SPEC-030) — gates `GET /api/admin/v1/system/module-status`. */
registerPermission({ id: "system.read", owner: "server", description: "Read boot/readiness module lifecycle status." });
registerPermission({ id: "storage.migrate", owner: "storage", description: "Plan, confirm, and execute a forward schema migration." });
registerPermission({ id: "backup.read", owner: "recovery", description: "Read restore points and this site's restore capability." });
registerPermission({ id: "backup.create", owner: "recovery", description: "Mint a restore point independent of any migration." });
registerPermission({ id: "backup.restore", owner: "recovery", description: "Confirm and execute a restore to a prior restore point." });
/** ADR-031 §6 (SPEC-033) — flat `comments.*` strings, one catalog, mirroring `analytics.read`'s
 * shape (not the `admin.<section>.<action>` convention). Public/anonymous submission is
 * ingress-governed (`CommentIngressPolicy`), not `authorize()`-gated — `comments.submit` exists
 * for a future member-only mode, not the anonymous path this spec's route uses. */
registerPermission({ id: "comments.read", owner: "comments", description: "Read comments and the moderation queue." });
registerPermission({ id: "comments.moderate", owner: "comments", description: "Approve, mark spam, or restore a comment." });
registerPermission({ id: "comments.reply", owner: "comments", description: "Post an operator reply to a comment thread." });
registerPermission({ id: "comments.delete", owner: "comments", description: "Trash a comment (soft delete, recoverable)." });
registerPermission({ id: "comments.delete.force", owner: "comments", description: "Purge a comment permanently (hard delete, not recoverable)." });
registerPermission({ id: "comments.submit", owner: "comments", description: "Reserved for a future member-only submission gate; the anonymous path is ingress-governed, not authorize()-gated." });
registerPermission({ id: "comments.configure", owner: "comments", description: "Change Comments settings (moderation defaults, spam threshold, depth cap)." });
/**
 * Admin-UI backend-gap closure session (2026-07-15, progress-ledger.md "Session 5") wired 18 new
 * admin routes over the content-types/entries/taxonomy domains gated by these three strings, but
 * registering them in this catalog was out of that session's own scope-file list — they worked
 * anyway via the seeded owner's `"*"` wildcard grant (`isKnownPermission()` is not consulted by
 * `authorize()` on the runtime path). This closes that disclosed catalog-completeness gap; no
 * route or authorize() behavior changes as a result (`isKnownPermission` has no caller in the
 * authorize path today, confirmed by the same grep Session 5 already ran).
 */
registerPermission({
  id: "admin.collections.read",
  owner: "content-types",
  description: "List Collections content types and their entries.",
});
registerPermission({
  id: "admin.collections.manage",
  owner: "content-types",
  description: "Create/edit content types and entries; deprecate/reactivate/tombstone a content type; publish/unpublish an entry.",
});
registerPermission({
  id: "admin.taxonomy.manage",
  owner: "taxonomy",
  description: "Read and write taxonomies, terms, and term assignments (ADR-044 registers one permission for this whole domain, no .read/.write split).",
});
/**
 * SPEC-021 (Media/Assets) / ADR-027 §7 — the flat `media.*` permission set the ADR names verbatim,
 * superseding the single, broader `media.write` above (mirrors `navigation.manage` ->
 * `admin.menus.*` and `integration.manage` -> `admin.integrations.manage`: deprecate-not-delete the
 * old flat string, register the new set, fan out via `registerPermissionMigration` below so no
 * existing `media.write` grant is silently narrowed). Wired into the 5 admin media routes this
 * pass (`routes/admin/media/{list,upload,update,trash,delete}.ts`); `media.download_original` and
 * `media.upload_svg` are registered for catalog completeness per the ADR but gate no route yet (no
 * original-download route exists, and SVG upload is already rejected outright rather than gated —
 * see the Programmer handoff). `media.manage` is the ADR's umbrella/admin-override grant, also
 * registered but not checked as an alternate by any route — no existing umbrella-as-alternate
 * precedent was found in this catalog to extend (unlike `admin.menus.manage`, which is likewise
 * registered but unused by any route), so one specific permission per route was kept, not invented.
 */
registerPermission({ id: "media.read", owner: "media", description: "List and read media assets." });
registerPermission({ id: "media.upload", owner: "media", description: "Upload a new media asset." });
registerPermission({ id: "media.update", owner: "media", description: "Edit a media asset's metadata (title/alt/caption/credit)." });
registerPermission({ id: "media.delete", owner: "media", description: "Trash (soft-delete) a media asset." });
registerPermission({
  id: "media.delete.force",
  owner: "media",
  description: "Permanently purge a trashed media asset, past the still-referenced guard.",
});
registerPermission({
  id: "media.download_original",
  owner: "media",
  description:
    "Mint a short-TTL signed URL to download a media asset's original bytes (ADR-027 §6). Reserved for a future API surface — no route uses this yet.",
});
registerPermission({
  id: "media.upload_svg",
  owner: "media",
  description: "Upload an SVG asset (sanitized at ingest, served origin-isolated per ADR-027 §6).",
});
registerPermission({
  id: "media.manage",
  owner: "media",
  description: "Umbrella grant covering every media.* action (mirrors owner-tier convenience grants like admin.menus.manage).",
});
registerPermissionMigration({
  from: "media.write",
  to: ["media.read", "media.upload", "media.update", "media.delete", "media.delete.force", "media.download_original", "media.upload_svg"],
  reason:
    "ADR-027 §7 / SPEC-021 REQ-40/OQ-02: media.write replaced by the flat media.* permission set; " +
    "every policy holding the old flat permission must not be silently narrowed by the split.",
});

/** Enumerate the full registered catalog (REQ-12 core capability; CLI wiring is N/A, see file header). */
export function listPermissions(): PermissionDescriptor[] {
  return permissionCatalog.list();
}

/** Whether `id` is a recognized catalog permission. `"*"` is intentionally excluded (see class doc). */
export function isKnownPermission(id: string): boolean {
  return permissionCatalog.has(id);
}
