/** Keep request measurements on Jini's real hooks and the shipped host HTTP/event owners. */
import { useFormEditor, useFormsList } from '@jini-ai/admin/forms/react';
import { useWiredAdminLocale } from '../hooks/use-admin-locale.hooks';
import { navigate } from '../lib/router';
import { createFormsTranslator, formsHostPorts } from '../integrations/jini-admin/forms-ports';

export function useWiredFormsList() {
  const locale = useWiredAdminLocale();
  return useFormsList({ port: formsHostPorts.formsApi, trash: formsHostPorts.formsTrash, events: formsHostPorts.formsEvents, t: createFormsTranslator({ locale }) }, { locale });
}

export function useWiredFormEditor(props: { formId: string; tab: 'fields' | 'submissions' }) {
  const locale = useWiredAdminLocale();
  return useFormEditor({ ...props, port: formsHostPorts.formsApi, navigate, t: createFormsTranslator({ locale }) });
}
