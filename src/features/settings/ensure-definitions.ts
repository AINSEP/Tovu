import type { ClockPort, IdGeneratorPort, JsonValue, UUID } from "../../core/ports";
import type { PrincipalRepoPort } from "../../identity";
import type { SettingsRepoPort } from "./ports";
import { resolveDefinitionRaw } from "./settings";
import { SCOPE_BIT, type SettingValueSchema } from "./types";
import { reconcileDefinitionDefault, registerDefinitions, type AuthorizeFn } from "./write-service";

/**
 * @file The one boot-time "register these definitions if they aren't already,
 * and keep their defaults honest if they are" loop, shared by every registrar
 * that backs a settings-dialog tab.
 *
 * This exists because the loop is genuinely identical everywhere it appears —
 * `assistant/execution-mode-settings.ts` had the first copy, and each of the
 * remaining thirteen ported tabs would have added another. The per-tab modules
 * keep what actually differs (the namespace, the key list, each key's schema
 * and default) and hand it to `ensureSettingDefinitions` as data.
 *
 * Note what is NOT abstracted here: `comments/settings.ts`, `seo/settings.ts`,
 * and `assistant/public-assistant-settings.ts` also contain a similar loop but
 * are deliberately left alone. Those three are `ownerKind: "site"` and pair
 * their registration with bespoke get/set services and their own permissions;
 * the settings-dialog tabs are `ownerKind: "core"` and read/write through the
 * generic SPEC-007 ledger routes with no bespoke service at all. Folding both
 * shapes into one helper would mean parameterising the differences that matter.
 */

/** One key's registration data — everything `registerDefinitions` needs that
 *  varies per key. */
export interface SettingDefinitionSpec {
  key: string;
  schema: SettingValueSchema;
  /**
   * Every non-secret definition needs a NON-NULL default.
   * `validateDefinitionInput` (`settings.ts`) rejects a null `default_json` for
   * every non-secret definition, full stop — there is no nullable-schema
   * carve-out in the actual check, whatever ADR-028 §6's prose says about "may
   * be JSON null iff nullable" (confirmed by
   * `__tests__/settings.registration.test.ts`'s own "rejects a null default for
   * a non-secret definition (totality)" case). A field that is nullable in
   * spirit needs a sentinel instead — see `execution-mode-settings.ts`'s
   * `MAX_TOKENS_UNSET_SENTINEL` for the worked example.
   *
   * Typed `Exclude<…, null>` rather than a bare primitive union: `DefinitionInput`
   * already accepts any `JsonValue`, and a `{ type: "json" }` definition needs an
   * array/object default (`core.analytics.excludedPaths` is the first). Excluding
   * `null` at the type level keeps the non-null rule above a compile error rather
   * than a boot-time throw.
   */
  defaultValue: Exclude<JsonValue, null>;
  /**
   * Bitmask over `SCOPE_BIT`. Defaults to `workspace`, which is what every
   * settings-dialog tab has wanted so far: one operator's choice shouldn't
   * silently become every workspace's. Pass `SCOPE_BIT.user` (or a mask
   * including it) for a genuinely per-operator preference.
   */
  scopes?: number;
}

export interface EnsureSettingDefinitionsDeps {
  settingsRepo: SettingsRepoPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  principals: PrincipalRepoPort;
}

export interface EnsureSettingDefinitionsInput {
  namespace: string;
  definitions: readonly SettingDefinitionSpec[];
  /** The trusted boot-time actor these writes are attributed to (mirrors
   *  `seo/settings.ts`'s/`comments/settings.ts`'s identical convention). */
  systemPrincipalId: UUID;
}

/** Boot-time infra work is trusted by construction — mirrors every other
 *  `ensure*SettingDefinitions`'s identical shim. */
const alwaysAllowBoot: AuthorizeFn = async () => ({ allowed: true, reason: "system_boot" });

/**
 * Idempotently registers every definition in `input.definitions` under
 * `input.namespace`, and reconciles the stored default of any that already
 * exist to the default source declares. Safe to call on every boot.
 *
 * The reconcile half matters as much as the register half: registration is
 * once-only, so without it a `defaultValue` edited in source never reaches an
 * install that has booted before. Code owns `core` defaults; the stored row
 * does not get to outvote it.
 *
 * All definitions registered here are `ownerKind: "core"` — a settings-dialog
 * tab configures a platform-level capability (which agent runtime backs the
 * admin's own assistant, whether this operator hears a completion sound),
 * not per-site content. Per the namespace-fence CHECK, `owner_kind='core'`
 * requires `workspaceId: null` at the DEFINITION level regardless of which
 * workspace is booting, while the `scopes` bitmask still lets each workspace
 * (or user) hold its own VALUE row. This mirrors
 * `features/settings/migration.ts`'s `core.presentation.activeThemeId`.
 *
 * @complexity O(n) in the number of definitions — each is one
 * skip-if-registered lookup plus at most one `registerDefinitions` call.
 */
export async function ensureSettingDefinitions(
  deps: EnsureSettingDefinitionsDeps,
  input: EnsureSettingDefinitionsInput,
): Promise<void> {
  const writeDeps = {
    repo: deps.settingsRepo,
    clock: deps.clock,
    ids: deps.ids,
    authorize: alwaysAllowBoot,
    principals: deps.principals,
  };

  for (const def of input.definitions) {
    const existing = await resolveDefinitionRaw(
      { repo: deps.settingsRepo },
      { namespace: input.namespace, key: def.key, workspaceId: null },
    );
    if (existing) {
      // Registration is once-only, but the DEFAULT is not. Without this, a
      // `defaultValue` changed in source is unreachable in any install that
      // has already booted — the stored `default_json` from first boot keeps
      // winning, for all fourteen settings-dialog tabs. See
      // `reconcileDefinitionDefault` for the bug this closes.
      //
      // Three slots are deliberately left alone rather than reconciled:
      // a non-`active` row (deprecated/tombstoned) is not ours to rewrite; a
      // non-`core` row is operator-owned; and a row whose identity differs
      // from the slot we asked for means `resolveDefinitionRaw` followed an
      // alias, so rewriting it would silently change a DIFFERENT definition's
      // default. `reconcileDefinitionDefault` would throw on the first two —
      // this skips them quietly because boot must not fail on them.
      const isSameSlot = existing.namespace === input.namespace && existing.key === def.key;
      if (existing.status === "active" && existing.ownerKind === "core" && isSameSlot) {
        await reconcileDefinitionDefault({
          deps: writeDeps,
          input: {
            namespace: input.namespace,
            key: def.key,
            workspaceId: null,
            defaultValue: def.defaultValue,
            callerPrincipalId: input.systemPrincipalId,
            authWorkspaceId: input.systemPrincipalId,
          },
        });
      }
      continue;
    }

    await registerDefinitions({
      deps: writeDeps,
      input: {
        callerPrincipalId: input.systemPrincipalId,
        // Platform (core) definitions aren't scoped to any one workspace, but
        // `registerDefinitions`'s authorization check still needs a workspace
        // context to authorize against — the seeded workspace mirrors every
        // other boot-time registrar's identical `authWorkspaceId` shape.
        authWorkspaceId: input.systemPrincipalId,
        definitions: [
          {
            namespace: input.namespace,
            key: def.key,
            ownerKind: "core",
            workspaceId: null,
            schema: def.schema,
            defaultValue: def.defaultValue,
            scopes: def.scopes ?? SCOPE_BIT.workspace,
            secret: false,
          },
        ],
      },
    });
  }
}
