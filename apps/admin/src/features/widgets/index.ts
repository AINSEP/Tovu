/**
 * @file Public surface of the `widgets` feature.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder. That indirection is the
 * point of the feature boundary: everything below can be split, renamed, or grown a `hooks/`
 * directory without the router noticing. Adding a file to this feature is not an API change unless
 * it is exported from this line.
 */
import { createElement, type ReactNode } from 'react';
import { useModulePanel } from '../../integrations/jini-admin/modules.hooks';
import { WidgetsModuleLoading } from '../../integrations/jini-admin/widgets-module.hooks';

/** Mount the library through Jini while retaining the host route's public export. */
export function WidgetsLibrary(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): ReactNode {
  return useModulePanel({ moduleId: 'widgets', pageId: 'library', route: { view: null, params: {}, query: new URLSearchParams() } },
    { loadingContent: createElement(WidgetsModuleLoading, { pageId: 'library' }) }).content;
}
/** Region routes retain the host's widget-regions agent page id in panels.tsx. */
export function WidgetRegions(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): ReactNode {
  return useModulePanel({ moduleId: 'widgets', pageId: 'regions', route: { view: null, params: {}, query: new URLSearchParams() } },
    { loadingContent: createElement(WidgetsModuleLoading, { pageId: 'regions' }) }).content;
}
/** Forward the matched region key unchanged; Jini owns the placement editor. */
export function WidgetRegionEditor({ regionKey }: { regionKey: string }, _optional: Record<string, never> = {}): ReactNode {
  return useModulePanel({ moduleId: 'widgets', pageId: 'region', params: { regionKey }, route: { view: null, params: { regionKey }, query: new URLSearchParams() } },
    { loadingContent: createElement(WidgetsModuleLoading, { pageId: 'region' }) }).content;
}
/** Both /new?type= and /:widgetId share this page; preserve null for a new instance. */
export function WidgetInstanceEditor({ widgetId, widgetType }: { widgetId: string | null; widgetType: string | null }, _optional: Record<string, never> = {}): ReactNode {
  const query = new URLSearchParams();
  if (widgetType !== null) query.set('type', widgetType);
  return useModulePanel({ moduleId: 'widgets', pageId: 'editor', params: { widgetId, widgetType }, route: { view: null, params: widgetId === null ? {} : { widgetId }, query } },
    { loadingContent: createElement(WidgetsModuleLoading, { pageId: 'editor' }) }).content;
}
