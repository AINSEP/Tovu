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
 */

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
  { id: "media.write", owner: "core", description: "Upload and manage media assets." },
  { id: "theme.set", owner: "core", description: "Change the active theme/presentation settings." },
  { id: "plugin.read", owner: "core", description: "List installed plugins and their state." },
  { id: "plugin.enable", owner: "core", description: "Enable a plugin." },
  { id: "plugin.disable", owner: "core", description: "Disable a plugin." },
  { id: "changeset.read", owner: "core", description: "Read the change-set audit trail." },
  { id: "changeset.revert", owner: "core", description: "Revert an applied change set." },
  { id: "member.manage", owner: "core", description: "Manage front-end members and subscriptions." },
  { id: "user.manage", owner: "core", description: "Create/disable operator users and principals." },
  { id: "role.manage", owner: "core", description: "Manage roles, policies, and grants." },
  { id: "settings.write", owner: "core", description: "Change workspace settings." },
  { id: "apikey.manage", owner: "core", description: "Issue and revoke API keys." },
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
  description: "Create, update, delete, and assign menus and location bindings.",
});
registerPermission({
  id: "integration.manage",
  owner: "integrations",
  description: "Create, update, pause, and delete webhook subscriptions; read delivery logs.",
});

/** Enumerate the full registered catalog (REQ-12 core capability; CLI wiring is N/A, see file header). */
export function listPermissions(): PermissionDescriptor[] {
  return permissionCatalog.list();
}

/** Whether `id` is a recognized catalog permission. `"*"` is intentionally excluded (see class doc). */
export function isKnownPermission(id: string): boolean {
  return permissionCatalog.has(id);
}
