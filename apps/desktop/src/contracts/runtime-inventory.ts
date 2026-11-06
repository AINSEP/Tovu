/**
 * Browser-safe agent-inventory contract shared by the Electron main process
 * and renderer. Keep this deliberately small: it is a picker DTO, not a way
 * to expose host capabilities to web content.
 */
export type RunnerAgentOption = {
  id: string;
  label: string;
  /** Optional model-specific levels; an empty list suppresses inherited levels. */
  reasoning?: readonly RunnerAgentOption[];
};

export interface RunnerAgentSummary {
  id: string;
  name: string;
  available: boolean;
  version: string | null;
  authStatus?: 'ok' | 'missing' | 'unknown';
  models: readonly RunnerAgentOption[];
  reasoningOptions: readonly RunnerAgentOption[];
  reasoningInModelId?: { readonly levels: readonly RunnerAgentOption[] };
  supportsCustomModel?: boolean;
  diagnostic?: string;
}

export const RUNNER_AGENT_INVENTORY_CHANNELS = {
  list: 'runner:agents:list',
  rescan: 'runner:agents:rescan',
  daemonOnline: 'runner:daemon:online',
} as const;

