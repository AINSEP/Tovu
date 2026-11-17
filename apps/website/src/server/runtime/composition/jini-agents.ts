/** @file Tovu's choice of agent runtime for the chat engine's server side: `@jini-ai/agent-runtime` classifies
 * saved run failures. Chat only states the port. The launcher's runtime port is bound per site, beside the
 * runtime it closes over (`agent-daemon-scope.ts`). */
import { classifyAgentServiceFailure, startupFailureMessage } from '@jini-ai/agent-runtime';
import type { ChatAgentFailurePort } from '@jini-ai/chat/core';

export const chatAgentFailures = {
  classifyServiceFailure: ({ text }) => classifyAgentServiceFailure({ text }),
  startupFailureMessage: (required, optional = {}) => startupFailureMessage(required, optional),
} satisfies ChatAgentFailurePort;
