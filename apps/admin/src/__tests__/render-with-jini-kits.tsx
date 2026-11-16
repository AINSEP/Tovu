import { createElement, type ComponentType, type ReactNode } from "react";
import { render as originalRender, renderHook as originalRenderHook, queries, type Queries, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { Container as RootContainer } from "react-dom/client";
import { ChatSurfacesProvider } from "@jini-ai/chat/react";
import { KitProvider } from "@jini-ai/ui-kit/react";
import { AdminKitProvider } from "@jini-ai/admin/react/kit";
import { UiKitProvider } from "@jini-ai/ui/react-kit";
import { adminKit, uiKit } from "../integrations/jini-kits";
import { chatSurfaces } from "../integrations/jini-surfaces";
import { tovuAgentAttrs, tovuKit } from "../integrations/jini-admin/kit";
import { FetchQueryProvider } from "./fetch-query-provider.test-helper";
export * from "@testing-library/react";

/** Tests that render kit-dependent screens (AssistantDock, MediaPicker, ProvidersTab...) mount the
 * same provider tree as `main.tsx`: KitProvider > FetchQueryProvider > UiKitProvider > AdminKitProvider
 * > ChatSurfacesProvider, with Tovu's real bindings. A test that mounts its own FetchQueryProvider or KitProvider keeps it:
 * inner providers win. */
function scope(wrapper?: ComponentType<{ children: ReactNode }>) {
  return function JiniKitsScope({ children }: { children: ReactNode }) {
    const inner = wrapper ? createElement(wrapper, { children }) : children;
    return createElement(KitProvider, { kit: tovuKit, agent: tovuAgentAttrs, children: createElement(FetchQueryProvider, {
      children: createElement(UiKitProvider, { kit: uiKit, children: createElement(AdminKitProvider, { kit: adminKit, children: createElement(ChatSurfacesProvider, { surfaces: chatSurfaces, children: inner }) }) }),
    }) });
  };
}
export function render<Q extends Queries = typeof queries, Container extends RootContainer = HTMLElement, BaseElement extends RootContainer = Container>(
  ui: ReactNode, options?: RenderOptions<Q, Container, BaseElement>,
): RenderResult<Q, Container, BaseElement> {
  return originalRender(ui, { ...options, wrapper: scope(options?.wrapper) });
}
export const renderHook: typeof originalRenderHook = (callback, options) => originalRenderHook(callback, { ...options, wrapper: scope(options?.wrapper) });
