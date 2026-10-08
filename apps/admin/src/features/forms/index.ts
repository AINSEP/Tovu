/**
 * @file Public surface of the `forms` feature.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder. That indirection is the
 * point of the feature boundary: everything below can be split, renamed, or grown a `hooks/`
 * directory without the router noticing. Adding a file to this feature is not an API change unless
 * it is exported from this line.
 */
import { createElement, type ReactNode } from 'react';
import '../../styles/native-domain-dialogs.css';
import '../../styles/form-field-attrs.css';
import { useModulePanel } from '../../integrations/jini-admin/modules.hooks';
import { FormsModuleLoading } from '../../integrations/jini-admin/forms-module.hooks';

/** Mount the Forms list through the host's Jini scope, keeping the public panel export. */
export function FormsList(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): ReactNode {
  return useModulePanel({ moduleId: 'forms', pageId: 'list', route: { view: null, params: {}, query: new URLSearchParams() } },
    { loadingContent: createElement(FormsModuleLoading) }).content;
}

/** Route-derived tabs share one editor identity so visiting submissions preserves the draft. */
export function FormEditor({ formId, tab }: { formId: string; tab: 'fields' | 'submissions' }, _optional: Record<string, never> = {}): ReactNode {
  return useModulePanel({ moduleId: 'forms', pageId: 'editor', params: { formId },
    route: { view: null, params: { formId }, query: new URLSearchParams({ tab }) } },
    { loadingContent: createElement(FormsModuleLoading, { editor: true }) }).content;
}
