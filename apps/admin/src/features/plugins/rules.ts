/**
 * @file The host binding of the plugins screens' rule functions: Jini's `createPluginRules`, called
 * once with this product's name, its plugins dictionary, its API error class and its shared error
 * fallback. The screens and hooks import the rule functions from here as plain functions.
 */
import { createPluginRules } from "@jini-ai/admin/screens/plugins/rules";
import { isProviderSettingRequired } from "@jini-ai/plugins/host";
import { ApiError, describeApiError as describeApiErrorDefault } from "../../lib/admin-http/request";
import { tPlugins } from "../../lib/i18n-common";

const rules = createPluginRules({
  productName: "Tovu",
  translate: tPlugins,
  describeApiError: describeApiErrorDefault,
  isApiError: (e): e is ApiError => e instanceof ApiError,
  isProviderSettingRequired,
});

export const {
  PLUGINS_RESOURCE, AGENT_PLUGINS_RESOURCE, PACKAGE_FILE_TREE_LOCALE, describeApiError, pluginConflictLines, pluginQuarantineHeadline, pluginRowDetailView, pluginRowFacts, pluginInstallPreviewDisplay, pluginToggleControl, pluginToggleAriaLabel, pluginSubline, pluginRemoveBlocker, pluginRemoveAriaLabel, buildPluginRemoveConfirmCopy, humanizeAgentPluginId, agentPluginDisplayName, agentPluginGlyphKind, agentPluginToggleAriaLabel, buildAgentPluginDisableConfirmCopy, agentPluginWarningText, agentPluginCompatibilityLines, updatableAgentPluginDigest, providerSettingRequiredHere, agentPluginRemoveOrEnableAriaLabel, toPackageFileView, packageFilesStatus, packageFilesListNotice, packageFilesRead, selectPackageFile, packageFilesViewState,
} = rules;
