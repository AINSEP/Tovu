import { createElement, type ComponentType, type ReactNode } from "react";
import { render as originalRender, renderHook as originalRenderHook, queries, type Queries, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { Container as RootContainer } from "react-dom/client";
import { FetchQueryProvider } from "./fetch-query-provider.test-helper";
import { withChatSurfaces } from "./chat-surfaces-render";
export * from "@testing-library/react";

/** Keep test reads on the production adapter; each tree gets a fresh cache and rerenders retain it. */
function scope(wrapper?: ComponentType<{ children: ReactNode }>) {
  const SurfacesScope = withChatSurfaces(wrapper); // built once per tree, so rerenders keep component identity
  return function QueryScope({ children }: { children: ReactNode }) {
    return createElement(FetchQueryProvider, { children: createElement(SurfacesScope, { children }) });
  };
}
export function render<Q extends Queries = typeof queries, Container extends RootContainer = HTMLElement, BaseElement extends RootContainer = Container>(
  ui: ReactNode, options?: RenderOptions<Q, Container, BaseElement>,
): RenderResult<Q, Container, BaseElement> {
  return originalRender(ui, { ...options, wrapper: scope(options?.wrapper) });
}
export const renderHook: typeof originalRenderHook = (callback, options) => originalRenderHook(callback, { ...options, wrapper: scope(options?.wrapper) });
