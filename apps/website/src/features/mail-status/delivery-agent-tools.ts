/** Email delivery visibility tools (email phases 4-5, 2026-10-22): what uses email, recent sends with
 *  provider feedback. Each calls the same shared operation as its admin route. */
export const mailDeliveryAgentToolCatalog = [{
  name: "mail_get_readiness",
  description: "Reports, per use of this site's email, whether it can send right now: sign-in links, subscription confirmations, form notifications and newsletter. Returns {checkedAt, uses: [{use, label, sendLane (interactive|notification), mailLane (transactional|bulk), state, reasons, sender, owner, formsConfigured?, evidence}]}. state is ready, blocked (reasons say why, e.g. sender_not_configured, durable_outbox_not_ready, origin_not_verified, consent_capability_unbound), disabled (e.g. newsletter sending switched off), not_configured (e.g. mail_delivery_unavailable, no_form_notifications) or unknown (that use's own check failed; other rows stand). evidence is the last observed send outcome {outcome, at} or null, separate from state: a passing test email does not make a blocked use ready. Uses each owning feature's own checks. Read-only. Requires admin.forms.manage.",
  sideEffects: "none" as const,
  authorization: { permission: "admin.forms.manage" },
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
}, {
  name: "mail_list_activity",
  description: "Lists this site's recent email sends, newest first, 25 per page by default. Returns {access (full|masked), items: [{id?, recipient, use (sign_in|newsletter_confirmation|form_notification|newsletter|test|unknown), outcome, lane, providerId, providerMessageId?, errorCode, createdAt, updatedAt}], nextCursor, empty (none_recorded|no_matches|null)}. outcome is accepted (the provider took it; not proof of delivery), delivered, bounced or complained (from provider feedback), suppressed, deferred (rate limited), failed or unknown (the provider may have taken it; never resend blindly). With mail.activity.read recipients are full and each item has an id for mail_get_activity; with only admin.forms.manage recipients are masked and there are no ids. Never returns message bodies or sign-in links. Filter with outcome, use and recipient (exact address; needs mail.activity.read); pass nextCursor as cursor for the next page.",
  sideEffects: "none" as const,
  authorization: { permission: "mail.activity.read" },
  inputSchema: { type: "object", additionalProperties: false, properties: {
    outcome: { type: "string", enum: ["accepted", "delivered", "bounced", "complained", "suppressed", "deferred", "failed", "unknown"] },
    use: { type: "string", enum: ["sign_in", "newsletter_confirmation", "form_notification", "newsletter", "test", "unknown"] },
    recipient: { type: "string", maxLength: 254, description: "One exact address." },
    limit: { type: "integer", minimum: 1, maximum: 100, description: "Page size; default 25." },
    cursor: { type: "string", description: "nextCursor from the previous page." },
  } },
}, {
  name: "mail_get_activity",
  description: "Shows one email send from mail_list_activity with its provider feedback timeline: {activity: {id, recipient, use, outcome, lane, providerId, providerMessageId, errorCode, createdAt, updatedAt}, feedback: [{kind (delivered|bounced|complained), hardBounce, providerId, occurredAt, receivedAt}]}. An empty feedback list means none received yet, not that it was delivered. Never returns the message body or links. Requires mail.activity.read.",
  sideEffects: "none" as const,
  authorization: { permission: "mail.activity.read" },
  inputSchema: { type: "object", additionalProperties: false, required: ["activityId"], properties: { activityId: { type: "string", description: "An id from mail_list_activity." } } },
}];
