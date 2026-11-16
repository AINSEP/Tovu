import { createElement, type ComponentType, type ReactNode } from "react";
import { render as originalRender, renderHook as originalRenderHook, queries, type Queries, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { Container as RootContainer } from "react-dom/client";
import { ChatSurfacesProvider } from "@jini-ai/chat/react";
import { chatSurfaces } from "@/integrations/jini-surfaces";
export * from "@testing-library/react";

/** Same surfaces production mounts in main.tsx; the wrapper also covers `rerender`. */
export function withChatSurfaces(wrapper?: ComponentType<{ children: ReactNode }>) {
  return function SurfacesScope({ children }: { children: ReactNode }) {
    return createElement(ChatSurfacesProvider, { surfaces: chatSurfaces, children: wrapper ? createElement(wrapper, { children }) : children });
  };
}
export function render<Q extends Queries = typeof queries, Container extends RootContainer = HTMLElement, BaseElement extends RootContainer = Container>(
  ui: ReactNode, options?: RenderOptions<Q, Container, BaseElement>,
): RenderResult<Q, Container, BaseElement> {
  return originalRender(ui, { ...options, wrapper: withChatSurfaces(options?.wrapper) });
}
export const renderHook: typeof originalRenderHook = (callback, options) => originalRenderHook(callback, { ...options, wrapper: withChatSurfaces(options?.wrapper) });
