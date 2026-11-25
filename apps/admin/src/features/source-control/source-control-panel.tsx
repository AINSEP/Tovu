import { navigateSourceControlTab } from "@jini-ai/admin/source-control/host/SourceControl.hooks";
import { agentHandle } from "@jini-ai/core/agent-handles";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "@jini-ai/admin/shell/lib/router";

import { TabBar } from "@jini-ai/admin/react/kit";
import { t } from "./source-control-host-i18n";
import { ProvidersTab } from "./ProvidersTab";
import { SourceControlIcon } from "./source-control-visuals";
import { useWiredSourceControlCredentials } from "./hooks/use-source-control-credentials.hooks";

import { resolveActiveTabId } from '@jini-ai/core/text';
import { SourceControl as SourceControlShell } from "@jini-ai/devops/source-control/react";
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

export function SourceControl({
  useAdminLocaleHook = () => useAdminLocale(), ...props }: SourceControlProps) {
  return (
    <SourceControlShell
      tabId={props.tabId}
      useAdminLocaleHook={useAdminLocaleHook}
      t={t}
      resolveActiveTabId={resolveActiveTabId}
      TabBar={TabBar}
      onTabChange={({ nextTabId }) => navigateSourceControlTab({ nextTabId, navigate })}
      providerIcon={<SourceControlIcon size={16} />}
      providers={<ProvidersTab useSourceControlCredentialsHook={props.useSourceControlCredentialsHook} />}
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
