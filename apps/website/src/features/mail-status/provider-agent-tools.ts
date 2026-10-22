/** Mail provider configuration tools (email phase 2, 2026-10-22). Both are read-only: configuring
 *  hands the secret entry to `credential_save`'s human form, and switching stays with the
 *  approval-gated `mail_set_provider` (`./agent-tools.ts`). */
export const mailProviderAgentToolCatalog = [{
  name: "mail_list_providers",
  description: "Lists every installed mail provider and how it is configured, without secrets: {setting: {transactional, bulk}, providers, refusals}. Each provider has id, label, origin (core|plugin), hosted, lanes it currently sends for (empty = installed but not active), capabilities {feedback, domainVerification, rateLimit}, credential {required, saved, label, credentialId, updatedAt} (presence only, never the key), selectable plus refusal (why it cannot be switched to yet) and setup.fields (the fields its key form asks for: key, label, type, required, defaultValue, placeholder, help, helpUrl). refusals lists plugin providers that did not load. Use before mail_configure_provider or mail_set_provider. Requires admin.forms.manage.",
  sideEffects: "none" as const,
  authorization: { permission: "admin.forms.manage" },
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
}, {
  name: "mail_configure_provider",
  description: "Prepares an installed mail provider's key WITHOUT making it the active provider. Returns {activated: false, provider, credential: {action (create|rotate), label, category, baseUrl}, credentialSetup}; follow it by calling credential_save with credentialSetup's prefill, so the person types the key into the secure masked form (never ask for a key in chat and never put one in any tool argument). A saved or rotated key is used from the next email on. Switching to the provider is a separate step: mail_set_provider. Refuses providers that need no key. Requires custom-credentials.write.",
  sideEffects: "none" as const,
  authorization: { permission: "custom-credentials.write" },
  inputSchema: { type: "object", additionalProperties: false, required: ["providerId"], properties: { providerId: { type: "string", description: "An installed provider id from mail_list_providers." } } },
}];
