import { Recovery as JiniRecovery, type RecoveryProps } from "@jini-ai/db/react/recovery/Recovery";
import { DataTable } from "@jini-ai/admin/react";
import { I18nProvider, SettingsDialogShell } from "@jini-ai/admin/react/kit";
import { SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { ServerLabel } from "@/components/status-labels";
import { useRecoveryNavigation } from "@jini-ai/admin/recovery/hooks/use-recovery-navigation.hooks";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { VIEWER_TIME_ZONE } from "@jini-ai/admin/shell/lib/viewer-time-zone";
import { categoryLabel, costClassLabel, isAssertiveRecoveryBanner, recoveryBannerTone, restoreButtonAccessibleName } from "@jini-ai/admin/recovery/rules";
import { t, sinceDiscardMessage, discardCountLine, baselineUnavailableMessage, restorePlanReadyMessage, restoreDoneMessage } from "@jini-ai/admin/recovery/recovery-i18n";
import { useWiredRecovery } from "./hooks/recovery-dependencies.hooks";
import { useWiredRestoreFlow } from "./hooks/restore-flow-dependencies.hooks";

/** Module-level so `useRecoveryNavigation`'s memoized handlers stay stable across renders. */
const recoveryNavigationPort = { navigate };

export function Recovery({ useRecoveryHook = useWiredRecovery, useRestoreFlowHook = useWiredRestoreFlow,
  useRecoveryNavigationHook = useRecoveryNavigation, ...props }: Pick<RecoveryProps, "tabId"> & Partial<Pick<RecoveryProps, "useRecoveryHook" | "useRestoreFlowHook" | "useRecoveryNavigationHook">>) {
  return <JiniRecovery {...props} useRecoveryHook={useRecoveryHook} useRestoreFlowHook={useRestoreFlowHook}
    useRecoveryNavigationHook={useRecoveryNavigationHook} navigationPort={recoveryNavigationPort}
    kit={{ DataTable, I18nProvider, SettingsDialogShell }} ServerLabel={ServerLabel}
    dictionaries={SETTINGS_DIALOG_DICTIONARIES} viewerTimeZone={VIEWER_TIME_ZONE}
    copy={{ t, sinceDiscardMessage, discardCountLine, baselineUnavailableMessage, restorePlanReadyMessage, restoreDoneMessage,
      categoryLabel, costClassLabel, isAssertiveRecoveryBanner, recoveryBannerTone, restoreButtonAccessibleName }} />;
}
