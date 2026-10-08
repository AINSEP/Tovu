/**
 * @file Public surface of the `redirects` feature.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder. That indirection is the
 * point of the feature boundary: everything below can be split, renamed, or grown a `hooks/`
 * directory without the router noticing. Adding a file to this feature is not an API change unless
 * it is exported from this line.
 */
import { createElement, type ReactNode } from 'react';
import { useModulePanel } from '../../integrations/jini-admin/modules.hooks';
import { RedirectsModuleLoading } from '../../integrations/jini-admin/redirects-module.hooks';

/** Mount the existing redirects route through the host's Jini module scope. */
export function Redirects(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): ReactNode {
  return useModulePanel({ moduleId: 'redirects', pageId: 'list', route: { view: null, params: {}, query: new URLSearchParams() } },
    { loadingContent: createElement(RedirectsModuleLoading) }).content;
}
