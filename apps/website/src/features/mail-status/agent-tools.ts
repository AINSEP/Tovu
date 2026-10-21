/** Mail configuration has no existing feature owner; this read-only diagnostic has its own catalog. */
export const mailStatusAgentToolCatalog = [{
  name: "system_get_mail_status",
  description: "Reports whether this site can send real email, the current mail driver, and a setup note. Use when email is not arriving, a magic link did not arrive, or to check whether sending is configured. Returns {mailDeliveryAvailable, driver, note} plus, when available, state (ready|unconfigured|degraded), lanes (transactional/bulk provider and state), warnings (sender_unverified, sender_unknown) and providers; console means messages are printed locally and never sent, unconfigured means no provider is chosen. This checks configuration, not whether a particular message reached an inbox. Does not expose credentials or send mail. Requires admin.forms.manage, like the admin mail-status route. Immediately after startup it can still show the unresolved console fallback.",
  sideEffects: "none" as const,
  authorization: { permission: "admin.forms.manage" },
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
}];
