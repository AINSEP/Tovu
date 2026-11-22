import { createElement, type ComponentType, type ReactNode } from "react";
import { ChatSurfacesProvider } from "@jini-ai/chat/react";
import { chatSurfaces } from "@/integrations/jini-surfaces";
export * from "@testing-library/react";

/** Same surfaces production mounts in main.tsx; the wrapper also covers `rerender`. */
export function withChatSurfaces(wrapper?: ComponentType<{ children: ReactNode }>) {
  return function SurfacesScope({ children }: { children: ReactNode }) {
    return createElement(ChatSurfacesProvider, { surfaces: chatSurfaces, children: wrapper ? createElement(wrapper, { children }) : children });
  };
}
// The full production provider tree (kits + surfaces) lives in one helper; the chat-surface tests need the kits too.
export { render, renderHook } from "./render-with-jini-kits";
