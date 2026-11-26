import { useAssistantTransport, type AssistantTransportInput, type AssistantTransportOptions } from "@jini-ai/admin/shell/components/AssistantDock/hooks/assistant-transport.hooks";

import { createTovuAssistantTransport } from "@/lib/assistant-transport";
import { isAgUiTransportEnabled } from "@/lib/assistant-transport-ag-ui";
import { selectedLocalCliReasoning } from "@jini-ai/admin/shell/lib/execution-settings-ledger";
import { localCliSelectionFromConfig } from "../execution-config-write";
import { getResumeCapableAgentIds } from "./agents-inventory.hooks";

/** The host collaborators the shell's `useAssistantTransport` requires: Tovu's transport factory, its two
 *  flag reads (the AG-UI canary and the resume-capable agent set) and the saved Local CLI selection readers. */
export const tovuAssistantTransportOptions: AssistantTransportOptions = {
  // Turn 1's run has no conversation id of its own to send — the pane adopts one lazily, from
  // a message delta that does not exist yet when `runContext` is frozen. See
  // `CreateTovuAssistantTransportOptions.ensureConversationId` for the full mechanism and the
  // amnesia it caused.
  createTransport: createTovuAssistantTransport,
  getAgUiEnabled: isAgUiTransportEnabled,
  // Which Local CLI agentIds carry their own multi-turn memory — see this file's own
  // `getResumeCapableAgentIds` doc, and `assistant-transport.ts`'s
  // `CreateTovuAssistantTransportOptions.getResumeCapableAgentIds` for the full contract.
  // `useRuntimeAccess`'s `listAgents`/`rescanAgents` keep the set it reads current.
  // (Here "this file" is `agents-inventory.hooks.ts`, where `getResumeCapableAgentIds` is bound to
  // this admin's own set; the hook that passes both to the factory lives in `@jini-ai/admin`'s
  // `assistant-transport.hooks`.)
  getResumeCapableAgentIds,
  selectedLocalCliReasoning: (config) => selectedLocalCliReasoning({ config }, {}),
  localCliSelectionFromConfig,
};

/** `useAssistantTransport` bound to Tovu's collaborators; `options` overrides individual ones (tests inject a fake factory). */
export function useTovuAssistantTransport(input: AssistantTransportInput, options: Partial<AssistantTransportOptions> = {}) {
  return useAssistantTransport(input, { ...tovuAssistantTransportOptions, ...options });
}
