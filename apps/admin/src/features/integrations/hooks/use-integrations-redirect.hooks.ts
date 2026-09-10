import { useEffect } from "react";
import { navigate } from "../../../lib/router";

/**
 * @file The side effect behind `IntegrationsRedirect.tsx` — split out so that `.tsx` file carries no
 * logic of its own, the same `<Name>.tsx`/`<Name>.hooks.ts` split every other feature in this admin
 * follows.
 */

/**
 * Sends the browser from the retired `/admin/integrations` index route to its two absorbed tabs'
 * new home, `/admin/providers` (labelled "Integrations" — see `panels.tsx`'s own comment on the
 * `providers`/`integrations` panels for the full history of why this redirect exists at all).
 *
 * `?tab=webhooks` specifically, not the merged screen's own default (`external-mcp`): a bookmark or
 * agent-remembered link to bare `/admin/integrations` used to open on `DeveloperApi.tsx`'s own
 * default tab, which was Webhooks (see that file's own now-deleted header for why — its default was
 * deliberately NOT the newer MCP Server tab). Redirecting to the merged screen's own first tab
 * instead would silently change which screen an old link lands on; pinning the target tab here keeps
 * that promise regardless of what `Providers.tsx`'s own default is or ever becomes.
 *
 * `replace: true`, not a pushed entry — the redirect should not become its own Back-button stop, or
 * Back from `/admin/providers` would land on `/admin/integrations` and bounce forward again
 * immediately, the same reasoning `router.ts`'s `redirectLegacyHashUrl` documents for its own
 * `replaceState` call.
 *
 * Runs once per mount via `useEffect` with an empty dependency array — this redirect target is a
 * fixed string, not derived from props or state, so there is nothing for a dependency list to react
 * to.
 *
 * @complexity O(1) — one fixed navigation call.
 */
export function useIntegrationsRedirect(): void {
  useEffect(() => {
    navigate("/providers?tab=webhooks", { replace: true });
  }, []);
}
