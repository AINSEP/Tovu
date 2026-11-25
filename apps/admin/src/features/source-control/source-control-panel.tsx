import { Icon } from "@jini-ai/ui";
import { SecretInput } from "@jini-ai/admin/shell/components/SecretInput/SecretInput";
import { CredentialHint } from "@/components/CredentialHint";
import { LINE_ICON } from "@jini-ai/admin/shell/components/line-icon";
import { VIEWER_TIME_ZONE } from "@jini-ai/admin/shell/lib/viewer-time-zone";
import { asciiSlug } from "@jini-ai/admin/shell/lib/ascii-slug";
import { fieldHelpText, fieldNameHandleSegment } from "@jini-ai/devops/deploy/react/rules";
import { navigateSourceControlTab } from "@jini-ai/admin/source-control/host/SourceControl.hooks";
import { agentHandle } from "@jini-ai/core/agent-handles";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "@jini-ai/admin/shell/lib/router";

import { TabBar } from "@jini-ai/admin/react/kit";
import { t } from "./source-control-host-i18n";
import { ProvidersTab } from "@jini-ai/devops/source-control/react/ProvidersTab";
import { SourceControlIcon } from "@jini-ai/devops/source-control/react/source-control-visuals";
import { useWiredSourceControlCredentials } from "./hooks/source-control-credentials-dependencies.hooks";

import { resolveActiveTabId } from '@jini-ai/core/text';
import { SourceControl as SourceControlShell } from "@jini-ai/devops/source-control/react";
/**
 * @file The Source Control page (`/admin/source-control`) — a CONNECTION page, not git integration.
 * See `ProvidersTab.tsx`'s own header for the scope boundary: save a personal access token per
 * provider so Tovu can read (and later push to) repositories, nothing more yet.
 *
 * ## 2026-08-16 — page shell rebuilt on `TabBar`, superseding this file's own PREVIOUS "never a tab
 * bar" decision
 *
 * This file used to hold every provider row directly, under a doc comment arguing explicitly
 * against a tab bar: "three flat rows was the explicit brief... this page has no tab bar to begin
 * with." That was a real, considered decision the owner made the day before (2026-08-15) — a
 * same-week reversal, not drift or an agent's own judgment call — confirmed directly by the owner
 * after seeing this page next to `deployment/Deployment.tsx`. A future reader who finds a tab bar
 * here where a comment once forbade one should read THIS as the record of that reversal, not a sign
 * the old comment was ignored. The page read as a settings-dialog panel dropped onto a route, not a
 * page: it carried no `page-header`/`TabBar` shell at all, while its nearest neighbour,
 * `deployment/Deployment.tsx`, does. This file now mirrors `Deployment.tsx`'s shell exactly — same
 * `TabBar` (not `@jini-ai/ui`'s `SettingsDialogShell`, for the identical reason that file's own
 * header gives: a dialog-shaped shell bundling its own sidebar plus a kicker/title/subtitle header
 * fights a page's own `.page-header`), same {@link resolveSourceControlTabId} guard against a junk `?tab=`
 * value, same `navigate(..., { replace: true })` on tab switch so the URL stays a correct deep link
 * without growing back-button history one entry per click.
 *
 * The three provider rows themselves did NOT change — moved verbatim into `ProvidersTab.tsx`, this
 * page's one tab today. "Flat rows, not sub-tabs" is still true one level down: GitHub, GitLab, and
 * Bitbucket are still three parallel rows inside that one tab, never three tabs of their own — this
 * pass only wraps that existing content in the page-level shell every other built Operations screen
 * already has. Only one real tab exists because only one real thing is built here — commit history,
 * sync, diffing, and branch management are still a separate, not-yet-started feature (see
 * `ProvidersTab.tsx`'s header) — so {@link SOURCE_CONTROL_TAB_IDS} stays a list of one rather than
 * padding itself out with a disabled placeholder tab for a feature that has not been spec'd yet.
 * `panels.tsx`'s own "its own Operations entry, not a Deployment tab" reasoning is unaffected by any
 * of this — that argument was always about this page's place in the top-level nav, not about
 * whether it may have an internal tab bar of its own.
 */
export interface SourceControlProps {
  /** The `?tab=` query value from `panels.tsx`'s `source-control` route (`URLSearchParams.get`
   *  returns `null` when the param is absent). */
  tabId?: string | null;
  /** DI seam for tests, threaded through to {@link ProvidersTab} — same convention
   *  `DeploymentProps` would carry if this shell owned any fetch/state of its own. It does not (each
   *  tab owns its own, same carve-out `Deployment.tsx`'s header documents), so this is the only prop
   *  besides {@link tabId}. */
  useSourceControlCredentialsHook?: typeof useWiredSourceControlCredentials;
  useAdminLocaleHook?: (required: Record<string, never>, optional?: Record<string, never>) => string;
}

/** Adapts the host locale hook (optional port positional arg) to the Jini shell's
 *  `(required, optional?)` hook contract, so the real hook is still the injected default. */
function useShellAdminLocale(_required: Record<string, never>, _optional: Record<string, never> = {}): string {
  return useAdminLocale();
}

export function SourceControl({
  useAdminLocaleHook = useShellAdminLocale, useSourceControlCredentialsHook = useWiredSourceControlCredentials, ...props }: SourceControlProps) {
  return (
    <SourceControlShell
      tabId={props.tabId}
      useAdminLocaleHook={useAdminLocaleHook}
      t={t}
      resolveActiveTabId={resolveActiveTabId}
      TabBar={TabBar}
      onTabChange={({ nextTabId }) => navigateSourceControlTab({ nextTabId, navigate })}
      providerIcon={<SourceControlIcon size={16} lineIcon={LINE_ICON} />}
      providers={<ProvidersTab useSourceControlCredentialsHook={useSourceControlCredentialsHook} useAdminLocaleHook={useAdminLocale} navigate={navigate} viewerTimeZone={VIEWER_TIME_ZONE} CredentialHint={CredentialHint} kit={{ SecretInput, Icon }} lineIcon={LINE_ICON} fieldHelpText={fieldHelpText} fieldNameHandleSegment={({ fieldName }) => fieldNameHandleSegment({ fieldName, asciiSlug })} copy={{ providersRegionLabel: "Connect a source-control account so Tovu can read and later push to your repositories", storedTokenHint: "Stored encrypted on the server. Once saved, Tovu never displays it again." }} />}
      headerAttrs={agentHandle({ handle: "source-control-header" }, {
        role: "region",
        label: "Source Control panel header — connect a git account so Tovu can read and later push to your repositories",
      })}
      copy={{
        descriptionKey: "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.",
        providerTabHandleLabel: "Switch to the Providers tab — connect a plugin-provided source control host so Tovu can read (and later push to) your repositories",
      }}
    />
  );
}
