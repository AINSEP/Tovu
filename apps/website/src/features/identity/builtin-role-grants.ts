import type { IdGenerator as IdGeneratorPort, UUID } from "@jini-ai/core/primitives";
import type { PolicyPermissionRepoPort, PolicyRepoPort, RolePolicyRepoPort, RoleRepoPort } from "@jini-ai/user-management";

/**
 * @file Boot-time backfill of a permission onto a BUILT-IN role's policy, for workspaces that were
 * already seeded before that permission existed.
 *
 * ## The gap this closes
 *
 * There are two ways a permission reaches a policy in this system, and between them they miss a
 * case that every deployed install is in:
 *
 * - `seedIdentity`'s built-in grant lists (`@jini-ai/cms`) reach a workspace exactly once, on first
 *   boot. It early-returns the moment an owner user exists, so a string added to those lists later
 *   provably never reaches an already-seeded workspace.
 * - `migrateDeprecatedPermissionGrants` (`permission-migrations.ts`) fans a new string out to every
 *   policy that already holds some OTHER string. That works only when such an anchor exists in the
 *   target workspace — it is a rename/split mechanism, and a `from` row that is absent matches
 *   nothing and grants nothing, silently.
 *
 * A permission introduced after a workspace was seeded, whose intended holder happens not to hold a
 * suitable anchor string in THAT workspace, therefore reaches nobody. It is not a fail-open — the
 * gate still evaluates and still refuses — but it is a silent capability REMOVAL: the feature stops
 * working for its intended role, and the only principal left is `owner`, on its `*` wildcard.
 *
 * This module is the third path: state the grant against the built-in ROLE it belongs to, and let
 * boot reconcile it. That is the same thing the seed list says, expressed so it also applies to a
 * workspace the seed will never visit again.
 *
 * ## Why by role, and why that is safe
 *
 * A registration names a built-in role (`"admin"`), not a policy id and not a policy name. The
 * fan-out resolves that to the role's OWN built-in policy — `seedIdentity` creates each built-in
 * role 1:1 with a `${name}-builtin-policy` marked `isBuiltin` — and writes one row there.
 *
 * The safety property is structural rather than incidental: the write targets one specific policy
 * row, so a policy belonging to a DIFFERENT role cannot be reached. Granting to `admin` cannot
 * touch `editor-builtin-policy` for the same reason it cannot touch an unrelated workspace's rows —
 * not because of an ordering, a guard, or a filter that a later edit could weaken.
 *
 * Non-built-in policies bound to the role are skipped. Those are operator-created attachments whose
 * contents are an operator's decision, not the library's; the built-in seed lists are the only
 * thing this mechanism is reconciling.
 *
 * ## Additive-only, like its neighbour
 *
 * Same invariant as `migrateDeprecatedPermissionGrants` and for the same reason: there is no
 * delete, no update, and no rewrite of any existing row anywhere in this file. A partial or failed
 * run leaves the previous, still-functioning state. Re-running is a no-op once the row exists, so
 * it is safe on every boot. Reverting a grant means deleting its registration — after which this
 * module stops ADDING the row, and removing the already-granted row is a deliberate, separate
 * operator action rather than something a code revert performs silently.
 */

/** One registered "this built-in role should hold this permission" statement. */
export interface BuiltinRoleGrant {
  /** Built-in role name as `seedIdentity` creates it — `"owner"`, `"admin"`, `"editor"`, `"viewer"`. */
  readonly role: string;
  /** The permission string that role's built-in policy should hold. */
  readonly permission: string;
  /** Human-readable rationale, surfaced in docs/reviews — not interpreted by this module. */
  readonly reason: string;
}

/**
 * Module-singleton registry, keyed by role+permission so re-registration overwrites rather than
 * duplicating — matches `registerPermissionMigration`'s and `PermissionCatalog.register`'s
 * established overwrite semantics.
 */
const registry = new Map<string, BuiltinRoleGrant>();

/**
 * Register a built-in-role grant for later fan-out. Idempotent per `{role, permission}` pair.
 *
 * Called as a module-evaluation side effect by the feature that owns the permission (see
 * `features/pages/permissions.ts`), so the feature keeps its own policy statement rather than
 * identity holding a list of other features' strings.
 *
 * @complexity O(1).
 */
export function registerBuiltinRoleGrant(grant: BuiltinRoleGrant): void {
  // `\u0000` is the ESCAPED form of the NUL separator this key has always used — same code unit,
  // same comparisons, written so tooling can read this file. A raw NUL byte here made git classify
  // the whole file as binary: `git log --numstat` reported `-\t-` for it, so `ab051e61`'s refactor
  // of this module showed as "Bin 7359 -> 8043 bytes" with no reviewable diff, in a permissions
  // file. Text tools that stop at a NUL byte skipped it for the same reason. Do not paste a literal
  // NUL back in; changing the separator to any other character would change how existing keys
  // compare, which is a different change entirely.
  registry.set(`${grant.role}\u0000${grant.permission}`, grant);
}

/** Enumerate every registered built-in-role grant. */
export function listBuiltinRoleGrants(): BuiltinRoleGrant[] {
  return [...registry.values()];
}

export interface ApplyBuiltinRoleGrantsDeps {
  roles: RoleRepoPort;
  rolePolicies: RolePolicyRepoPort;
  policies: PolicyRepoPort;
  policyPermissions: PolicyPermissionRepoPort;
  idGen: IdGeneratorPort;
  workspaceId: UUID;
}

export interface ApplyBuiltinRoleGrantsResult {
  /** New `policy_permissions` rows written across every registered grant. `0` once reconciled. */
  grantedCount: number;
}

/**
 * Reconcile one grant against one already-resolved built-in role: walk that role's policy
 * bindings, skip anything that is not a built-in policy or that already holds the permission, and
 * add the row where it is missing. Split out of `applyBuiltinRoleGrants` so the grant loop and the
 * binding loop are not both inline in one function.
 *
 * @complexity O(p) where p = policies bound to the role; small and bounded (built-in roles are 1:1
 * with their policy).
 */
async function grantToRoleBindings(
  deps: ApplyBuiltinRoleGrantsDeps,
  grant: BuiltinRoleGrant,
  roleId: UUID
): Promise<number> {
  const { workspaceId } = deps;
  let granted = 0;

  const bindings = await deps.rolePolicies.listByRoleId({ workspaceId, roleId });
  for (const binding of bindings) {
    const policy = await deps.policies.findById({ workspaceId, id: binding.policyId });
    if (!policy?.isBuiltin) continue;

    const held = await deps.policyPermissions.listByPolicyId({ workspaceId, policyId: policy.id });
    if (held.some((row) => row.permission === grant.permission)) continue;

    await deps.policyPermissions.save({
      id: deps.idGen.newId(),
      workspaceId,
      policyId: policy.id,
      permission: grant.permission,
      // Unscoped, exactly as every seeded built-in grant is — a `resourceType` here would make
      // the row match only one `entityType` and turn a missing grant into a subtler one.
      resourceType: null,
      constraintJson: null,
    });
    granted += 1;
  }

  return granted;
}

/**
 * For every registered `{role, permission}`, ensure that built-in role's own built-in policy holds
 * the permission — adding only the rows that are missing.
 *
 * Skips a registration whose role does not exist in this workspace, and skips a role that is not
 * `isBuiltin` (an operator-created role that happens to share a built-in's name is not what a
 * registration means). Never removes or mutates any existing row.
 *
 * Safe to call on every boot: a rerun with nothing to add returns `grantedCount: 0`, mirroring
 * `migrateDeprecatedPermissionGrants`' boot-safety contract.
 *
 * @complexity O(g * p) where g = registered grants and p = policies bound to a named role; both are
 * small, bounded collections (built-in roles are 1:1 with their policy).
 */
export async function applyBuiltinRoleGrants(
  deps: ApplyBuiltinRoleGrantsDeps
): Promise<ApplyBuiltinRoleGrantsResult> {
  const grants = listBuiltinRoleGrants();
  if (grants.length === 0) return { grantedCount: 0 };

  const { workspaceId } = deps;
  let grantedCount = 0;

  for (const grant of grants) {
    const role = await deps.roles.findByName({ workspaceId, name: grant.role });
    if (!role || !role.isBuiltin) continue;

    grantedCount += await grantToRoleBindings(deps, grant, role.id);
  }

  return { grantedCount };
}
