import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { t } from "./source-control-i18n";
import { ProvidersTab } from "./ProvidersTab";
import { useWiredSourceControlCredentials } from "./hooks/use-source-control-credentials.hooks";

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
 * with." That was a real, considered decision made the day before — and the owner's next look at
 * the live page reversed it. The page read as a settings-dialog panel dropped onto a route, not a
 * page: it carried no `page-header`/`TabBar` shell at all, while its nearest neighbour,
 * `deployment/Deployment.tsx`, does. This file now mirrors `Deployment.tsx`'s shell exactly — same
 * `TabBar` (not `@jini-ai/ui`'s `SettingsDialogShell`, for the identical reason that file's own
 * header gives: a dialog-shaped shell bundling its own sidebar plus a kicker/title/subtitle header
 * fights a page's own `.page-header`), same {@link resolveActiveTabId} guard against a junk `?tab=`
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

const SOURCE_CONTROL_TAB_IDS = ["providers"] as const;
type SourceControlTabId = (typeof SOURCE_CONTROL_TAB_IDS)[number];

/** Falls back to the one tab for an absent or unrecognized `?tab=` value — same "don't trust a raw
 *  query value" guard `Deployment.tsx`'s own `resolveActiveTabId` applies, for the same reason (a
 *  stale link or a typo must not blank the panel). Kept as a real function rather than inlined even
 *  with one tab today: `Deployment.tsx` started at five tabs where this guard mattered immediately,
 *  and a second real tab landing here later should not have to reintroduce it.
 *  @complexity O(1) — fixed-size id list, not caller-controlled. */
function resolveActiveTabId(tabId: string | null | undefined): SourceControlTabId {
  return tabId && (SOURCE_CONTROL_TAB_IDS as readonly string[]).includes(tabId) ? (tabId as SourceControlTabId) : "providers";
}

export interface SourceControlProps {
  /** The `?tab=` query value from `panels.tsx`'s `source-control` route (`URLSearchParams.get`
   *  returns `null` when the param is absent). See {@link resolveActiveTabId}. */
  tabId?: string | null;
  /** DI seam for tests, threaded through to {@link ProvidersTab} — same convention
   *  `DeploymentProps` would carry if this shell owned any fetch/state of its own. It does not (each
   *  tab owns its own, same carve-out `Deployment.tsx`'s header documents), so this is the only prop
   *  besides {@link tabId}. */
  useSourceControlCredentialsHook?: typeof useWiredSourceControlCredentials;
}

export function SourceControl(props: SourceControlProps) {
  const locale = useAdminLocale();
  const activeTabId = resolveActiveTabId(props.tabId);

  const tabs: TabBarTab[] = [
    {
      id: "providers",
      label: t(locale, "Providers"),
      handle: "source-control-tab-providers",
      handleLabel: "Switch to the Providers tab — connect GitHub, GitLab, or Bitbucket so Tovu can read (and later push to) your repositories",
    },
  ];

  function handleTabChange(nextTabId: string) {
    navigate(`/source-control?tab=${nextTabId}`, { replace: true });
  }

  return (
    <div className="page">
      <div
        className="page-header"
        {...agentHandle("source-control-header", {
          role: "region",
          label: "Source Control panel header — connect a git account so Tovu can read and later push to your repositories",
        })}
      >
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Operations")}</p>
          <h1 className="page-title">{t(locale, "Source Control")}</h1>
          <p className="page-description">
            {t(
              locale,
              "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet."
            )}
          </p>
        </div>
      </div>
      <TabBar
        ariaLabel={t(locale, "Source Control")}
        tabs={tabs}
        activeId={activeTabId}
        onChange={handleTabChange}
        containerHandle="source-control-tab-bar"
      />
      {activeTabId === "providers" ? <ProvidersTab useSourceControlCredentialsHook={props.useSourceControlCredentialsHook} /> : null}
    </div>
  );
}
