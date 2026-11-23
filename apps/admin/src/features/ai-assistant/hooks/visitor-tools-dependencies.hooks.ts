import { ChatSettingsSegmented } from "@jini-ai/chat/react";
import type { VisitorToolsPanelProps } from "@jini-ai/admin/screens/assistant-settings/VisitorToolsPanel";
import { useVisitorToolLimitsDraft, useVisitorTools, type VisitorToolsDependencies } from "@jini-ai/admin/screens/assistant-settings/use-visitor-tools.hooks";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { ApiError, describeApiError } from "@/lib/admin-http/request";
import { VISITOR_TOOLS_CONFLICT_CODE, VISITOR_TOOLS_NAMESPACE, visitorToolsPort } from "@/lib/visitor-tools";
// The segmented pill's look lives with the chat settings it was built for; imported here too so this
// tab never depends on the dock having loaded it first.
import "../../../styles/assistant.css";

/**
 * @file The host binding for the engine's "Visitor tools" tab: this admin's visitor-tools endpoint,
 * the settings-ledger namespace its policy lives under, the 409 revision-conflict code, the shared
 * error-to-copy rule, and the chat dock's segmented pill and ⓘ tip widgets.
 */
export const visitorToolsDependencies: Omit<VisitorToolsDependencies, "port"> = {
  namespace: VISITOR_TOOLS_NAMESPACE,
  isConflict: ({ error }) => error instanceof ApiError && error.code === VISITOR_TOOLS_CONFLICT_CODE,
  describeError: ({ error, fallback }) => describeApiError({ e: error, fallback }),
};

export function useWiredVisitorTools(required: { t: (key: string) => string }, _optional = {}) {
  return useVisitorTools({ ...visitorToolsDependencies, port: visitorToolsPort, t: required.t });
}

/** Every `VisitorToolsPanel` prop except `t`, bound to this admin's live endpoint and widgets. */
export const visitorToolsPanelBindings: Omit<VisitorToolsPanelProps, "t"> = {
  useVisitorToolsHook: useWiredVisitorTools,
  useVisitorToolLimitsDraftHook: useVisitorToolLimitsDraft,
  InfoTip,
  Segmented: ChatSettingsSegmented,
};
