import { bindAccessTokensTab } from "@jini-ai/admin/security/host/AccessTokensTab";
import { useRemoveConfirmDialog, useAddCustomCredentialDialog, useMergedSecretsOrder } from "@jini-ai/admin/security/host/AccessTokensTab.hooks";
import { fieldNameHandleSegment, fieldHelpText } from "@jini-ai/devops/deploy/react/rules";
import { CredentialHint } from "@/components/CredentialHint";
import { OnboardingChipField } from "@jini-ai/ui";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { removeDialogBody, removeDialogTitle, otherCredentialRemoveDialogBody } from "@/lib/i18n-common";
import { ACCESS_TOKEN_CATEGORIES } from "./rules";
import { accessTokenExtraFieldIdSuffix } from "@jini-ai/integrations/react/credentials/access-token-forms";
import { accessTokensCountText, otherCredentialMatchesQuery } from "@jini-ai/integrations/react/credentials/other-credential-stores";
import { providerGroupHandleLabel, tokenRowHandleLabel, ACCESS_TOKEN_PROVIDER_COPY } from "./access-token-copy";
import { ConnectedMarkIcon, DisclosureChevronIcon, SearchIcon } from "../../integrations/jini-admin/security-visuals";
import { useWiredAccessTokens } from "./hooks/use-access-tokens.hooks";
import { OtherCredentialEntry } from "@jini-ai/integrations/react/credentials/OtherCredentialsSection";
import { useOtherCredentialRemoveDialog } from "@jini-ai/integrations/react/credentials/OtherCredentialsSection.hooks";
import { useWiredCopyKeys } from "./hooks/copy-keys-dependencies.hooks";
import { VIEWER_TIME_ZONE } from "@jini-ai/admin/shell/lib/viewer-time-zone";
import "../../styles/native-domain-dialogs.css";
import "@jini-ai/admin/security/host/copy-keys-dialog.css";

/** "Remove from Tovu," never "Revoke": removal forgets the stored copy, the provider keeps the key. */
const REMOVE_FROM_TOVU = "Remove from Tovu";

/** Whether the "Use a saved key" entry renders above the list (see its render site). */
const SHOW_COPY_KEYS_ENTRY = true;

/** The bindings each "Other credentials" row's {@link OtherCredentialEntry} renders with. */
export const OTHER_CREDENTIAL_ENTRY_DEPS = {
  useAdminLocaleHook: useAdminLocale,
  useOtherCredentialRemoveDialogHook: useOtherCredentialRemoveDialog,
  removeDialogTitle,
  otherCredentialRemoveDialogBody,
  VIEWER_TIME_ZONE,
  REMOVE_FROM_HOST: REMOVE_FROM_TOVU,
  removeHandleLabel: ({ name }: { name: string }) => `Remove ${name} from Tovu`,
};

export const AccessTokensTab = bindAccessTokensTab({
  hooks: {
    useAdminLocaleHook: useAdminLocale,
    useAccessTokensHook: useWiredAccessTokens,
    useCopyKeysHook: useWiredCopyKeys,
    useMergedSecretsOrderHook: useMergedSecretsOrder,
    useRemoveConfirmDialogHook: useRemoveConfirmDialog,
    useAddCustomCredentialDialogHook: useAddCustomCredentialDialog,
    useTabBarKeyboardHook: useTabBarKeyboard,
  },
  kit: {
    CredentialHint, OnboardingChipField, ConnectedMarkIcon, DisclosureChevronIcon, SearchIcon,
    OtherCredentialEntry: props => <OtherCredentialEntry {...props} deps={OTHER_CREDENTIAL_ENTRY_DEPS} />,
  },
  deps: {
    ACCESS_TOKEN_CATEGORIES, ACCESS_TOKEN_PROVIDER_COPY,
    showCopyKeysEntry: SHOW_COPY_KEYS_ENTRY,
    viewerTimeZone: VIEWER_TIME_ZONE,
    removeLabel: REMOVE_FROM_TOVU,
    removeTokenHandleLabel: ({ provider }) => `Open the confirm dialog to remove this ${provider} token from Tovu`,
    storedTokenNotice: "Stored encrypted on the server. Once saved, Tovu never displays it again.",
    hostingPluginsHref: "/admin/addons/agent-plugins",
    providerGroupHandleLabel, tokenRowHandleLabel, fieldNameHandleSegment,
    fieldHelpText: ({ field }) => fieldHelpText({ field }) ?? "",
    accessTokenExtraFieldIdSuffix, resolveTabBarTabIndex, otherCredentialMatchesQuery,
    accessTokensCountText, removeDialogTitle, removeDialogBody,
  },
});
