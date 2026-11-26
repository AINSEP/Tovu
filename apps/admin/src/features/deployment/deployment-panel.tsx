import { downloadDockerfile as jiniDownloadDockerfile } from "@jini-ai/devops/deploy/react/download-dockerfile";
import { Deployment as DeploymentScreen } from "@jini-ai/devops/deploy/react/Deployment";
import { HISTORY_TAB_CLASSES } from "./deployment-classes";
import { HistoryTab } from "@jini-ai/devops/deploy/react";
import { HistoryIcon } from "@jini-ai/devops/deploy/react/deployment-visuals";
import { navigateDeploymentTab } from "@jini-ai/admin/deployment/Deployment.hooks";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { resolveActiveTabId } from "@jini-ai/core/text";
import { useAdminLocale, useWiredAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { LINE_ICON } from "@jini-ai/admin/shell/components/line-icon";
import { TabBar } from "@jini-ai/ui/tab-strip";
import { dockerfileLineCountLabel } from "@jini-ai/admin/deployment/deployment-i18n";
import { t } from "./deployment-host-i18n";
import { StaticSiteTab } from "./StaticSiteTab";
import { useWiredDeploymentOverview } from "./hooks/use-deployment-overview.hooks";
import { useWiredDockerfileSource } from "./hooks/dockerfile-source-dependencies.hooks";
import { STATIC_SITE_CAPABILITIES, FULL_SITE_CAPABILITIES, envVarNotes, unsafeOwnerPasswordVar, copy } from "./deployment-host-policy";

/** Triggers a browser file download of `contents` as `Dockerfile` — plain DOM manipulation with no
 *  state of its own to expose, so it stays a local function rather than living in the hook (see
 *  `use-dockerfile-source.hooks.ts`'s header for why `copy` DOES live there but this doesn't).
 *  `URL.revokeObjectURL` after the click so the blob URL doesn't leak for the rest of the page's
 *  lifetime — the anchor never needs to be appended to the document for `.click()` to fire it. */
export function downloadDockerfile({ contents }: { contents: string }, _options = {}): void {
  jiniDownloadDockerfile({ contents, Blob, URL, document });
}

function DeploymentHistoryTab() {
  return <HistoryTab useAdminLocaleHook={useWiredAdminLocale} t={t} historyIcon={<HistoryIcon size={22} lineIcon={LINE_ICON} />} publishHref="/admin/deployment?tab=static-site" agentHandle={agentHandle} classes={HISTORY_TAB_CLASSES} />;
}

export function Deployment({ tabId, useAdminLocaleHook = useAdminLocale }: { tabId?: string | null; useAdminLocaleHook?: typeof useAdminLocale } = {}) {
  return <DeploymentScreen {...(tabId === undefined ? {} : { tabId })} useAdminLocaleHook={useAdminLocaleHook} t={t} onTabChange={({ nextTabId }) => navigateDeploymentTab({ nextTabId, navigate })} TabBar={TabBar} StaticSiteTab={StaticSiteTab} HistoryTab={DeploymentHistoryTab} agentHandle={agentHandle} resolveActiveTabId={resolveActiveTabId} lineIcon={LINE_ICON}
    overview={{ useDeploymentOverviewHook: useWiredDeploymentOverview, staticSiteCapabilities: STATIC_SITE_CAPABILITIES, fullSiteCapabilities: FULL_SITE_CAPABILITIES, envVarNotes, unsafeOwnerPasswordVar, copy, agentHandle, lineIcon: LINE_ICON }}
    dockerfile={{ useDockerfileSourceHook: useWiredDockerfileSource, download: downloadDockerfile, dockerfileLineCountLabel, agentHandle, lineIcon: LINE_ICON }} />;
}
