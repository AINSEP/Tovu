import { Email as JiniEmail } from "@jini-ai/user-management/react/mail/Email";
import { EmailProviderTab as JiniEmailProviderTab } from "@jini-ai/user-management/react/mail/EmailProviderTab";
import { EmailTemplateEditor as JiniEmailTemplateEditor, type EmailTemplateEditorControl } from "@jini-ai/user-management/react/mail/EmailTemplateEditor";
import type { EmailProviderControl, EmailStatusControl, EmailTabHooks, EmailThemeBoundaryHook } from "@jini-ai/user-management/react/mail/email-view.types";
import { resolveTabBarTabIndex } from "@jini-ai/ui/tab-strip";
import type { AdminMailStatus } from "@jini-ai/admin/screens/email/api/mail-status-api.types";
import { COPY, EDITOR_COPY, EDITOR_HOOKS, EDITOR_KIT, KIT, PARTS, RULES, navigateEmail, type HostEmailTypes } from "../email-panel";

/**
 * @file The package's Email views bound to this app's real parts, kit, rules, copy and router — the
 * same bindings `email-panel.tsx` mounts — with only the state hooks swapped for test fakes.
 */

/** The `/email` page with injected status and tab hooks. */
export function Email(props: { tabId?: string; part?: string; useEmailHook: () => EmailStatusControl<AdminMailStatus>; tabHooks: EmailTabHooks<HostEmailTypes>; useAdminThemeBoundaryHook?: EmailThemeBoundaryHook }) {
  return (
    <JiniEmail<HostEmailTypes> tabId={props.tabId} part={props.part} useEmailHook={props.useEmailHook} tabHooks={props.tabHooks}
      parts={PARTS} kit={KIT} copy={COPY} rules={RULES} navigate={navigateEmail} useAdminThemeBoundaryHook={props.useAdminThemeBoundaryHook ?? (() => ({}))} />
  );
}

/** The Provider tab with this app's kit, copy and rules. */
export function EmailProviderTab(props: { controller: EmailProviderControl<HostEmailTypes["provider"], HostEmailTypes["choice"]>; status: AdminMailStatus | null; locale: string; selectedId?: string | null; onSelect?: (id: string) => void }) {
  return <JiniEmailProviderTab {...props} kit={KIT} copy={COPY} rules={RULES} />;
}

/** The template editor page with an injected editor hook. */
export function EmailTemplateEditor(props: { id: string; locale?: string; useEditorHook: (required: { id: string }) => EmailTemplateEditorControl }) {
  return (
    <JiniEmailTemplateEditor id={props.id} locale={props.locale} hooks={{ ...EDITOR_HOOKS, useEditorHook: props.useEditorHook }}
      kit={EDITOR_KIT} copy={EDITOR_COPY} resolveTabIndex={resolveTabBarTabIndex} />
  );
}
