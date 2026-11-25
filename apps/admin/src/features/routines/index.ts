import { createElement } from "react";
import { useRecurringSchedulePicker } from "@jini-ai/ui";
import { useHostAdminLocale } from "../../hooks/admin-locale-dependencies.hooks";
import { authenticatedAdminRequest } from "../../lib/admin-http/request";
import { routinesKit } from "../../integrations/jini-kits";
import { RoutinesMount } from "./RoutinesMount";
import { useRoutinesController, type RoutinesFocus, type RoutinesTimers } from "./Routines.hooks";
import { createRoutinesApi } from "./routines-api";
import { useConversationLinkBuilder } from "./use-conversation-deep-link";

/**
 * @file Host binding for the Routines screen: the one place that picks the live session request,
 * browser timers/focus and the kit. Why: the screen and controller take all of these as injected
 * values; production wiring lives here so panels.tsx imports one name.
 */
const ROUTINES_BASE_PATH = "/api/admin/assistant/routines";
const api = createRoutinesApi({
  basePath: ROUTINES_BASE_PATH,
  requestAdminJson: (request) => authenticatedAdminRequest(request, { basePath: ROUTINES_BASE_PATH, requireJson: true }),
});
const timers: RoutinesTimers = { setInterval: (callback, ms) => window.setInterval(callback, ms), clearInterval: (handle) => window.clearInterval(handle as number) };
const focus: RoutinesFocus = { subscribe: (callback) => { window.addEventListener("focus", callback); return () => window.removeEventListener("focus", callback); } };
const useBoundRoutinesController = ({ visible }: { visible: boolean }) => useRoutinesController({ api, visible, focus, timers });

export function Routines({ releaseEnabled }: { releaseEnabled: boolean }) {
  return createElement(RoutinesMount, {
    useAdminLocaleHook: useHostAdminLocale, useRoutinesController: useBoundRoutinesController, useSchedulePicker: useRecurringSchedulePicker,
    useConversationDeepLink: useConversationLinkBuilder, kit: routinesKit, releaseEnabled, theme: "light", visible: true,
  });
}
