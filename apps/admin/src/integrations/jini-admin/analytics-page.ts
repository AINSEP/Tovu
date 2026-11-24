/**
 * @file The Analytics route's page: the Jini screen with this app's controller hook injected.
 * `panel-pages.ts` lazy-loads THIS module, so the screen, its 21-locale dictionary and the host
 * bindings stay out of the main bundle until the route is visited.
 */
import { createElement, type ReactElement } from 'react';
import { Analytics as AnalyticsScreen } from '@jini-ai/admin/screens/analytics';
import { useWiredAnalytics } from './analytics-module.hooks';

/** Mounts the Jini Analytics screen with the host-bound `useWiredAnalytics` (its required prop). */
export function Analytics(_props: Record<string, never> = {}, _optional: Record<string, never> = {}): ReactElement {
  return createElement(AnalyticsScreen, { useAnalyticsHook: useWiredAnalytics });
}
