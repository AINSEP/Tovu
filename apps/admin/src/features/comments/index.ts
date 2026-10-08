/**
 * @file Public surface of the `comments` feature.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder. That indirection is the
 * point of the feature boundary: everything below can be split, renamed, or grown a `hooks/`
 * directory without the router noticing. Adding a file to this feature is not an API change unless
 * it is exported here. Screens and rules now live in `@jini-ai/admin/comments`.
 */
import { createElement, type ReactNode } from 'react';
import { useModulePanel } from '../../integrations/jini-admin/modules.hooks';
import { CommentsModuleLoading } from '../../integrations/jini-admin/comments-module.hooks';

/** Mount the existing comments route through the host's Jini module scope. */
export function Comments(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): ReactNode {
  return useModulePanel({ moduleId: 'comments', pageId: 'queue', route: { view: null, params: {}, query: new URLSearchParams() } },
    { loadingContent: createElement(CommentsModuleLoading) }).content;
}
