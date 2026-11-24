import { createElement, type ComponentType } from 'react';
import type { UseAdminLocaleHook } from '@jini-ai/admin/react/kit';
import { useModulePanel } from './modules.hooks';
import { CommentsModuleLoading } from './comments-module.hooks';
import { FormsModuleLoading } from './forms-module.hooks';
import { WidgetsModuleLoading } from './widgets-module.hooks';

/**
 * @file What each `@jini-ai/admin/screens/{comments,forms,widgets}` panel needs from this host: its
 * module-panel hook and a loading view. The screens take `ModuleLoading` as a prop-less component,
 * while the host's loading views take the REQUIRED `useAdminLocaleHook` (no default, no direct import
 * of the live hook), so the panel's own injected hook is bound into them here.
 */

type LocaleProp = { useAdminLocaleHook: UseAdminLocaleHook };

// why: a loading view built inline would be a new component type on every render, remounting the
// notice each time the panel re-rendered while its scope loads. One bound component per (view, hook)
// pair keeps the identity stable for as long as the same hook is injected.
const boundLoadings = new WeakMap<object, WeakMap<UseAdminLocaleHook, unknown>>();

function bindLoading<P extends LocaleProp>(
  { Loading, useAdminLocaleHook }: { Loading: ComponentType<P>; useAdminLocaleHook: UseAdminLocaleHook },
  _optional: Record<string, never> = {},
): ComponentType<Omit<P, 'useAdminLocaleHook'>> {
  let byHook = boundLoadings.get(Loading);
  if (byHook === undefined) {
    byHook = new WeakMap();
    boundLoadings.set(Loading, byHook);
  }
  const cached = byHook.get(useAdminLocaleHook);
  if (cached !== undefined) return cached as ComponentType<Omit<P, 'useAdminLocaleHook'>>;
  const Bound = (props: Omit<P, 'useAdminLocaleHook'>) => createElement(Loading, { ...props, useAdminLocaleHook } as unknown as P);
  byHook.set(useAdminLocaleHook, Bound);
  return Bound;
}

/** Props for `@jini-ai/admin/screens/comments`'s `Comments`. */
export function commentsMount({ useAdminLocaleHook }: LocaleProp, _optional: Record<string, never> = {}) {
  return { useModulePanel, ModuleLoading: bindLoading({ Loading: CommentsModuleLoading, useAdminLocaleHook }) };
}

/** Props for `@jini-ai/admin/screens/forms`'s `FormsList` and `FormEditor`. */
export function formsMount({ useAdminLocaleHook }: LocaleProp, _optional: Record<string, never> = {}) {
  return { useModulePanel, ModuleLoading: bindLoading({ Loading: FormsModuleLoading, useAdminLocaleHook }) };
}

/** Props for each of `@jini-ai/admin/screens/widgets`'s four panels. */
export function widgetsMount({ useAdminLocaleHook }: LocaleProp, _optional: Record<string, never> = {}) {
  return { useModulePanel, ModuleLoading: bindLoading({ Loading: WidgetsModuleLoading, useAdminLocaleHook }) };
}
