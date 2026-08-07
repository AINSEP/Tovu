import { type Dispatch, type SetStateAction, useState } from "react";

/**
 * @file `useAsyncAction` — collapses the `[saving, setSaving]` / `[error, setError]` pair that
 * shows up around nearly every mutation handler in this app's higher-state screens: `setXSaving
 * (true); setXError(null); try { await ...; <success side effects> } catch (e) { setXError
 * (describeApiError(e, "failed to ...")); } finally { setXSaving(false); }`, repeated once per
 * button. `useUsers`/`useRoles` alone carry that shape 5+ times each.
 *
 * Sibling to `components/WidgetConfigFields/WidgetConfigFields.hooks.tsx`'s `useFetchedOptions` —
 * that one is the "load a list once on mount" primitive; this is the "track one explicit,
 * operator-triggered mutation" primitive. Same spirit (parameterize by the call and the error
 * description, return the minimal state), opposite lifecycle (triggered, not automatic).
 *
 * **Deliberately does not track a `value`.** Every call site this was extracted from
 * (`onCreateRole`, `onCreatePolicy`, `onAssignRole`, `confirmResetPassword`, `onToggleStatus`, …)
 * is a pure side-effecting mutation — nothing about "the thing that was saved" needs to live in
 * React state on success, because the caller already re-fetches (`reload()`) or updates its own
 * more specific state inside `action` itself. Adding an unused `value`/`setValue` pair to force a
 * uniform shape would be complexity in service of symmetry, not of any actual caller — the opposite
 * of this hook's own purpose.
 *
 * **`describeError` is a parameter, not an import.** Every feature that has adopted this hook
 * (`features/users`, `features/roles`) carries its OWN `describeApiError` override in its own
 * `rules.ts`, with screen-specific server-error-code translations — `Roles.tsx`'s
 * `RESOURCE_CONFLICT` reads "still referenced", `Users.tsx`'s reads "username already in use", for
 * the same server code. A shared `hooks/` primitive importing any one of those would either pick a
 * winner or import every screen's rules module for no reason; taking the describer as a parameter
 * keeps this file free of any feature-specific knowledge.
 *
 * **Not every `saving`/`error` pair in this codebase is a fit.** Several are intentionally shared
 * across multiple actions (`useUsers`'s `grantError` is written by three different handlers so the
 * "Manage" panel has one error slot, not three) or track something other than a plain boolean
 * (`useRoles`'s `rowSavingId`/`useUsers`'s `toggleSavingId` are the ID of the busy row, not a
 * boolean, so a `RowMenu` can disable only the row actually in flight). Forcing either shape onto
 * this hook would either lose that behavior or bloat this file's API for one caller — left as
 * hand-rolled `useState` at those call sites instead.
 *
 * @example
 * const createRole = useAsyncAction();
 * async function onCreateRole(e: React.FormEvent) {
 *   e.preventDefault();
 *   await createRole.run(async () => {
 *     await api.createRole(roleName);
 *     setRoleName("");
 *     await reload();
 *   }, (e) => describeApiError(e, "failed to create role"));
 * }
 * // renders: disabled={createRole.saving}, and createRole.error under the field
 */

export interface AsyncActionState {
  /** True for the duration of the most recent {@link run} call — the button/field disabled flag. */
  saving: boolean;
  /** The most recent failure, describable and ready to render; `null` on success or before the
   *  first attempt. Cleared at the start of every {@link run} call, same as every hand-rolled
   *  version this replaces (`setXError(null)` was always the second line, not an afterthought). */
  error: string | null;
  /** Exposed directly (not only through `run`) for the same reason several call sites needed their
   *  own `setXError` on the return type already — clearing the error at a moment that isn't the
   *  start of a new attempt (`useUsers`'s `openResetPassword` clears `passwordError` when the
   *  dialog OPENS, before any save has been attempted).
   *
   *  Typed as the full `Dispatch<SetStateAction<…>>` rather than the narrower `(error) => void`,
   *  because this is `useState`'s own setter passed through unchanged and several call sites
   *  re-export it under a name whose declared type is already `Dispatch<SetStateAction<string |
   *  null>>` (`useUsers`' `setPasswordError`). Narrowing it here would make the primitive
   *  unassignable to the very signatures it is replacing, for no gain — the updater form is
   *  supported by the underlying setter whether or not the type admits it. */
  setError: Dispatch<SetStateAction<string | null>>;
  /**
   * Runs `action`, tracking `saving`/`error` around it exactly like the boilerplate it replaces.
   * `action` owns every success-path side effect (clearing fields, closing dialogs, `reload()`) —
   * this function's only job is the try/catch/finally shell, so the ORDER those side effects run
   * in (all before `saving` flips back to `false`) is unchanged from the pre-extraction code.
   *
   * @param action - The mutation call plus its success-path side effects, run inside the try.
   * @param describeError - Turns a caught error into the message `error` will hold — almost always
   *   `(e) => describeApiError(e, "failed to …")` from the caller's own `rules.ts`.
   */
  run: (action: () => Promise<void>, describeError: (e: unknown) => string) => Promise<void>;
}

export function useAsyncAction(): AsyncActionState {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, describeError: (e: unknown) => string) {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, setError, run };
}
