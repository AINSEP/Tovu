import { loadAdminExecutionCredential, saveAdminExecutionCredential } from "../lib/execution-settings";
import type { AdminExecutionCredentialPort } from "@jini-ai/admin/shell/hooks/admin-execution-credential-port.hooks";

/**
 * @file The only place this hook's port reaches `lib/execution-settings` — see
 * `@jini-ai/admin/shell/hooks/admin-execution-credential-port.hooks`'s file header for why the split exists. The port type, its unset view and its in-memory
 * fake live beside it in Jini; this host file keeps only the live binding.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. */
export const defaultAdminExecutionCredentialPort: AdminExecutionCredentialPort = {
  loadAdminExecutionCredential: () => loadAdminExecutionCredential(),
  saveAdminExecutionCredential: ({ patch }, _options = {}) => saveAdminExecutionCredential(patch),
};
