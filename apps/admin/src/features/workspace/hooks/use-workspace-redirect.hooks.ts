import { useEffect } from "react";
import { navigate } from "../../../lib/router";

/**
 * @file The side effect behind `WorkspaceRedirect.tsx` — split out so that `.tsx` file carries no
 * logic of its own, the same `<Name>.tsx`/`<Name>.hooks.ts` split every other feature in this admin
 * follows (and the same split `features/integrations/hooks/use-integrations-redirect.hooks.ts`
 * uses for its own, near-identical redirect).
 */

/**
 * Sends the browser from the retired `/admin/workspace` index route to the Workspace screen's new
 * home, `/admin/settings?tab=workspace` — see `panels.tsx`'s own comment on the `workspace` panel
 * for why this redirect exists (SPEC-044's OQ-04, resolved 2026-09-10: Workspace folds into a
 * Settings tab instead of keeping its own top-level nav row).
 *
 * `?tab=workspace` names the new tab's own id directly — unlike `useIntegrationsRedirect`'s target,
 * which had to pick a NON-default tab of a screen it was merging into, this redirect has no such
 * ambiguity: the Workspace screen's content moved to exactly one place, `SettingsUi.tsx`'s
 * `"workspace"` tab, so that is the only id that could be correct here.
 *
 * `replace: true`, not a pushed entry — the redirect should not become its own Back-button stop, or
 * Back from `/admin/settings` would land on `/admin/workspace` and bounce forward again immediately,
 * the same reasoning `useIntegrationsRedirect` and `router.ts`'s `redirectLegacyHashUrl` document
 * for their own `replaceState` calls.
 *
 * Runs once per mount via `useEffect` with an empty dependency array — this redirect target is a
 * fixed string, not derived from props or state, so there is nothing for a dependency list to react
 * to.
 *
 * @complexity O(1) — one fixed navigation call.
 */
export function useWorkspaceRedirect(): void {
  useEffect(() => {
    navigate("/settings?tab=workspace", { replace: true });
  }, []);
}
