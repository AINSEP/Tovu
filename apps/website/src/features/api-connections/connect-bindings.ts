import type { ApiConnectionSignInLink, ApiConnectionConnectMessages } from '@jini-ai/integrations/api-connections';
import { hostedSignInLink } from './browser-binding.js';

/** Host browser binding and exact model-facing copy; the domain owns the sign-in flow. */
export const apiConnectionConnectPorts: { signInLink: ApiConnectionSignInLink; messages: ApiConnectionConnectMessages } = {
  signInLink: hostedSignInLink,
  messages: {
    toolError: ({ message }) => `agent_plugin_connect: ${message}`,
    sharedUnavailable: 'Shared connections are available only on this Mac. Choose this site for a hosted sign-in.',
  },
};
