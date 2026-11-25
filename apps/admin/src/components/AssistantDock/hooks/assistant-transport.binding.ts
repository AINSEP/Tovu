import { useAssistantTransport, type AssistantTransportInput, type AssistantTransportOptions } from "@jini-ai/admin/shell/components/AssistantDock/hooks/assistant-transport.hooks";

import { createTovuAssistantTransport } from "@/lib/assistant-transport";
import { isAgUiTransportEnabled } from "@/lib/assistant-transport-ag-ui";
import { selectedLocalCliReasoning } from "@/lib/execution-settings";
import { localCliSelectionFromConfig } from "../execution-config-write";
import { getResumeCapableAgentIds } from "./agents-inventory.hooks";

/** The host collaborators the shell's `useAssistantTransport` requires: Tovu's transport factory, its two
 *  flag reads (the AG-UI canary and the resume-capable agent set) and the saved Local CLI selection readers. */
export const tovuAssistantTransportOptions: AssistantTransportOptions = {
  createTransport: createTovuAssistantTransport,
  getAgUiEnabled: isAgUiTransportEnabled,
  getResumeCapableAgentIds,
  selectedLocalCliReasoning,
  localCliSelectionFromConfig,
};

/** `useAssistantTransport` bound to Tovu's collaborators; `options` overrides individual ones (tests inject a fake factory). */
export function useTovuAssistantTransport(input: AssistantTransportInput, options: Partial<AssistantTransportOptions> = {}) {
  return useAssistantTransport(input, { ...tovuAssistantTransportOptions, ...options });
}
