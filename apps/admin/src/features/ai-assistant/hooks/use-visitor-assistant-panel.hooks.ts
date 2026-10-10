import type { PublicAssistantSettings } from "@/lib/api";
import { VISITOR_STATUS_COPY, visitorAssistantStatus, type VisitorAssistantStatus } from "../rules";
import type { AiAssistantController } from "./use-ai-assistant.hooks";

/**
 * @file Everything the Visitor tab's layout decides (2026-10-09 redesign): the status pill, whether
 * the enable switch may turn ON, and the widget choice. The credential form keeps its own hook
 * (`use-visitor-credential-form.hooks.ts`); this one only reads that form's `hasStoredKey`.
 */
export interface VisitorAssistantPanelController {
  status: VisitorAssistantStatus;
  /** English keys for the pill and its hint line; the view translates them. */
  statusCopy: { label: string; hint: string };
  /** False while no key is saved and the assistant is off: the switch cannot turn ON yet. */
  canEnable: boolean;
  /** The reason under a disabled switch, or `null` when it is usable. */
  enableBlockedReason: string | null;
  /** The ⓘ text beside the switch: what the CURRENT state means for visitors. */
  enableInfo: string;
  widget: "react" | "vanilla";
  /** The widget `<select>`'s change handler; any value but `"vanilla"` means the standard widget. */
  chooseWidget: (value: string) => void;
}

/**
 * @param required.settings - The loaded public settings (`useAiAssistant`'s `settings`).
 * @param required.hasStoredKey - The credential form's `hasStoredKey`: a key is saved on the server.
 * @param required.setWidget - `useAiAssistant`'s `setWidget`.
 * @complexity Time/space: O(1).
 */
export function useVisitorAssistantPanel(
  required: { settings: PublicAssistantSettings; hasStoredKey: boolean; setWidget: AiAssistantController["setWidget"] },
  _optional: Record<string, never> = {},
): VisitorAssistantPanelController {
  const { settings, hasStoredKey, setWidget } = required;
  const { status, canEnable } = visitorAssistantStatus({ publicEnabled: settings.publicEnabled, hasStoredKey });
  return {
    status,
    statusCopy: VISITOR_STATUS_COPY[status],
    canEnable,
    enableBlockedReason: canEnable ? null : "Save a key in step 1 first.",
    enableInfo: settings.publicEnabled
      ? "Visitors can chat with it on every public page."
      : "When off, your site loads no assistant code and has no chat endpoint.",
    widget: settings.widget ?? "react",
    chooseWidget: (value) => void setWidget({ widget: value === "vanilla" ? "vanilla" : "react" }),
  };
}
