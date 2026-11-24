import { navigate } from "@jini-ai/admin/shell/lib/router";
import { uniqueId } from "@jini-ai/admin/shell/lib/unique-id";
import { useEmail, type EmailController, type EmailPort } from "@jini-ai/admin/screens/email/hooks/use-email.hooks";
import { useCaptureClearFlow, useEmailActivity, type EmailActivityController } from "@jini-ai/admin/screens/email/hooks/use-email-activity.hooks";
import { useEmailOverview, type EmailOverviewController } from "@jini-ai/admin/screens/email/hooks/use-email-overview.hooks";
import { useEmailProvider, useProviderChoices, type EmailProviderController } from "@jini-ai/admin/screens/email/hooks/use-email-provider.hooks";
import { useLoad } from "@jini-ai/admin/screens/email/hooks/email-load.hooks";
import { useEmailSender, type EmailSenderController } from "@jini-ai/admin/screens/email/hooks/use-email-sender.hooks";
import { useEmailTemplateEditor, type EmailTemplateEditorController } from "@jini-ai/admin/screens/email/hooks/use-email-template-editor.hooks";
import { useEmailTemplates, type EmailTemplatesController } from "@jini-ai/admin/screens/email/hooks/use-email-templates.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { ApiError } from "@/lib/admin-http/request";
import { mailStatusApi } from "./api/mail-status-api";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import { authApi } from "../auth/api/auth-api";
import { emailApi } from "./email-api";

/**
 * @file This app's bindings of the Email screen's data hooks (`@jini-ai/admin/screens/email/hooks/*`):
 * each `useWired*` hands its hook this app's HTTP client (`emailApi`, `mailStatusApi`), its transport
 * error class (`ApiError`), its router and its id source. `Email.tsx` and `EmailTemplateEditor.tsx`
 * mount these; tests mount the unbound hooks with fakes.
 */

export const defaultEmailPort: EmailPort = { getMailStatus: () => mailStatusApi.getMailStatus() };

/** A fresh idempotency key for one click (8-64 of `[A-Za-z0-9_-]`). */
export function newRequestId(): string {
  return uniqueId().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64).padEnd(8, "0");
}

/** Where a new template goes: this app's router (a module function, so its identity is stable). */
function openEmailTemplate(routePath: string): void {
  navigate({ routePath });
}

/** Binds the real client and the resolved locale — the zero-argument hook the screen mounts. */
export function useWiredEmail(): EmailController {
  const locale = useAdminLocale();
  return useEmail({ port: defaultEmailPort, locale, ApiError });
}

/** The real API port. */
export function useWiredEmailOverview(): EmailOverviewController {
  return useEmailOverview({ api: emailApi, ApiError, requestId: newRequestId });
}

/** The real API ports: the email client, the Plugins client (list + enable) and this app's transport error. */
export function useWiredEmailProvider(optional: { onChanged?: () => void } = {}): EmailProviderController {
  return useEmailProvider({ api: emailApi, pluginApi: integrationsApi, ApiError, useLoadHook: useLoad, useProviderChoicesHook: useProviderChoices }, optional);
}

/** The real API port. */
export function useWiredEmailSender(optional: { onChanged?: () => void } = {}): EmailSenderController {
  return useEmailSender({ api: emailApi, ApiError }, optional);
}

/** The real API port. */
export function useWiredEmailTemplates(optional: { newName?: string } = {}): EmailTemplatesController {
  return useEmailTemplates({ api: emailApi, ApiError, open: openEmailTemplate }, optional);
}

/** The real API port. */
export function useWiredEmailTemplateEditor(required: { id: string }): EmailTemplateEditorController {
  return useEmailTemplateEditor({ api: emailApi, id: required.id, ApiError });
}

/** The real API port; the session's permissions decide whether "Clear test emails" is offered (`undefined` until known or if unreadable, so it stays hidden). */
export function useWiredEmailActivity(): EmailActivityController {
  const { view } = useLoad({ ApiError, load: readSessionPermissions });
  return useEmailActivity({ api: emailApi, ApiError, useLoadHook: useLoad, useCaptureClearFlowHook: useCaptureClearFlow }, { permissions: view.kind === "loaded" ? view.data : undefined });
}

/** The signed-in person's effective permissions (a module function, so its identity is stable for `useLoad`). */
const readSessionPermissions = async (): Promise<readonly string[]> => (await authApi.me()).effectivePermissions ?? [];
