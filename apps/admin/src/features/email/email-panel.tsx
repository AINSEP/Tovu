import { Email } from "@jini-ai/user-management/react/mail/Email";
import { EmailTemplateEditor } from "@jini-ai/user-management/react/mail/EmailTemplateEditor";
import type { EmailCopy, EmailKit, EmailNavigate, EmailParts, EmailRules, EmailTabHooks } from "@jini-ai/user-management/react/mail/email-view.types";
import type { AdminAgentPluginRow } from "@jini-ai/core/contracts/site/cms-agent-plugins";
import { ChatSettingsSegmented } from "@jini-ai/chat/react";
import { Icon } from "@jini-ai/ui";
import { useDirtyGuard } from "@jini-ai/ui/panel-kit";
import { TabBar, resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import "@jini-ai/ui/settings-dialog.css";
import { DEVICE_PREVIEW_WIDTHS } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks";
import { DevicePreviewFrame } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame";
import { DevicePreviewToggle } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreviewToggle";
import { ADMIN_BASE, adminHref, navigate } from "@jini-ai/admin/shell/lib/router";
import { PAGE_PREVIEW_IFRAME_SANDBOX } from "@jini-ai/admin/pages/page-editor-rules";
import type { AdminMailStatus } from "@jini-ai/admin/screens/email/api/mail-status-api.types";
import type { MailProviderConfiguration } from "@jini-ai/admin/screens/email/email-api.types";
import { t } from "@jini-ai/admin/screens/email/email-i18n";
import { EmailActivityTab } from "@jini-ai/admin/screens/email/EmailActivityTab";
import { EmailOverviewTab } from "@jini-ai/admin/screens/email/EmailOverviewTab";
import { Chip, Loaded, Section, when } from "@jini-ai/admin/screens/email/EmailParts";
import { createEmailProviderLabel } from "@jini-ai/admin/screens/email/EmailProviderTab.hooks";
import { createEmailNavigate } from "@jini-ai/admin/screens/email/Email.hooks";
import { EmailSenderTab, EmailStatusFacts } from "@jini-ai/admin/screens/email/EmailSenderTab";
import { EmailTemplatesTab } from "@jini-ai/admin/screens/email/EmailTemplatesTab";
import { emailSummary } from "@jini-ai/admin/screens/email/hooks/use-email.hooks";
import type { EmailActivityController } from "@jini-ai/admin/screens/email/hooks/use-email-activity.hooks";
import type { EmailOverviewController } from "@jini-ai/admin/screens/email/hooks/use-email-overview.hooks";
import { isFullyActive } from "@jini-ai/admin/screens/email/hooks/use-email-provider.hooks";
import type { EmailSenderController } from "@jini-ai/admin/screens/email/hooks/use-email-sender.hooks";
import { useEmailTemplateView } from "@jini-ai/admin/screens/email/hooks/use-email-template-view.hooks";
import type { EmailTemplatesController } from "@jini-ai/admin/screens/email/hooks/use-email-templates.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { translateAdminNavLabel } from "../../lib/admin-nav-i18n";
import { t as pageEditorT } from "../pages/page-editor-i18n";
import { agentPluginDisplayName } from "../plugins/rules";
import {
  useWiredEmail, useWiredEmailActivity, useWiredEmailOverview, useWiredEmailProvider, useWiredEmailSender,
  useWiredEmailTemplateEditor, useWiredEmailTemplates,
} from "./email-hooks-host";
// The segmented pill's look (`.jini-chat-settings-segmented`) lives with the chat dock's styles.
import "../../styles/assistant.css";
import "@jini-ai/admin/screens/email/email.css";

/**
 * @file This app's mount of the Email screen and the template editor page
 * (`@jini-ai/user-management/react/mail/*`): the views are the package's, every hook, tab view, UI
 * library part, rule and dictionary bound here once.
 *
 * Design: `ADS-memory/reports/2026-10-22-email-page-design-codex.md` (+ its "Owner decisions").
 * Each tab's state lives in its own hook, mounted only while that tab shows so the page does not fire
 * every read at once. No provider-name branches: everything shown comes from the server's data.
 *
 * Tabs (`/admin/email?tab=overview|provider|sender|templates|activity`): the URL owns the selection,
 * so a reload or a link (the mail banner's "Set up email" opens `?tab=provider`) lands on that tab.
 * Inside a tab, a segmented pill shows one section at a time (owner, 2026-10-22: the stacked cards
 * were too much to take in); the URL owns that choice too, as `?p=`.
 *
 * The Provider tab renders the package's `SecretInput` / `ConfirmDialog`, so `/email` must mount
 * inside `UserManagementKitProvider` (`main.tsx` wraps the whole app in it).
 */

/** This app's concrete Email type set. */
export interface HostEmailTypes {
  readonly status: AdminMailStatus;
  readonly provider: MailProviderConfiguration;
  readonly choice: AdminAgentPluginRow;
  readonly overview: EmailOverviewController;
  readonly sender: EmailSenderController;
  readonly templates: EmailTemplatesController;
  readonly activity: EmailActivityController;
}

export const TAB_HOOKS: EmailTabHooks<HostEmailTypes> = {
  overview: useWiredEmailOverview, provider: useWiredEmailProvider, sender: useWiredEmailSender,
  templates: useWiredEmailTemplates, activity: useWiredEmailActivity,
};

export const PARTS: EmailParts<HostEmailTypes> = { Overview: EmailOverviewTab, Sender: EmailSenderTab, Activity: EmailActivityTab, Templates: EmailTemplatesTab };

export const KIT: EmailKit<AdminMailStatus> = { TabBar, Segmented: ChatSettingsSegmented, Chip, Section, Loaded, StatusFacts: EmailStatusFacts };

export const RULES: EmailRules<AdminMailStatus, MailProviderConfiguration, AdminAgentPluginRow> = {
  summarize: emailSummary, isFullyActive, when, providerLabel: createEmailProviderLabel, displayName: agentPluginDisplayName,
};

export const COPY: EmailCopy = { t, navLabel: translateAdminNavLabel };

/** This app's URL shape for a tab and its section; a section id is user-visible data, so it is encoded. */
export const navigateEmail: EmailNavigate = createEmailNavigate({
  deps: { routePath: "/email", tabKey: "tab", partKey: "p", navigate },
});

/** The `/email` page. */
export function EmailPanel(props: { tabId?: string | null; part?: string | null }) {
  return (
    <Email<HostEmailTypes> tabId={props.tabId} part={props.part} useEmailHook={useWiredEmail} tabHooks={TAB_HOOKS}
      parts={PARTS} kit={KIT} copy={COPY} rules={RULES} navigate={navigateEmail} useAdminThemeBoundaryHook={useAdminThemeBoundary} />
  );
}

/** The template editor's bindings, module-level so the hooks and kit keep one identity across renders. */
export const EDITOR_HOOKS = {
  useEditorHook: useWiredEmailTemplateEditor, useAdminLocaleHook: useAdminLocale, useEmailTemplateViewHook: useEmailTemplateView,
  useTabBarKeyboardHook: useTabBarKeyboard, useDirtyGuardHook: useDirtyGuard,
};
export const EDITOR_KIT = {
  Icon, Chip, Loaded, DevicePreviewFrame, DevicePreviewToggle, devicePreviewWidths: DEVICE_PREVIEW_WIDTHS,
  previewSandbox: PAGE_PREVIEW_IFRAME_SANDBOX, adminBase: ADMIN_BASE, adminHref,
};
export const EDITOR_COPY = { t, pageEditorT };

/** The `/email/templates/:id` page. */
export function EmailTemplateEditorPanel(props: { id: string; locale?: string }) {
  return <EmailTemplateEditor id={props.id} locale={props.locale} hooks={EDITOR_HOOKS} kit={EDITOR_KIT} copy={EDITOR_COPY} resolveTabIndex={resolveTabBarTabIndex} />;
}
