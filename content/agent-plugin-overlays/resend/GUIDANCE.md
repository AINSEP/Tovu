# Tovu host guidance for resend

This Tovu guidance comes before the portable `resend` skill. Where the two differ, this guidance is
the more specific one.

**Enable and switch.** Enable the sending adapter in Email → Provider → + Add provider, then save
its key. Choose “Use this provider” (or `mail_set_provider { providerId: "resend" }`) to switch
delivery; enabling or saving alone never switches mail. Never ask the person to restart Tovu.

## Bounces and complaints (webhook)

Resend tells Tovu when a message hard-bounces or is marked as spam, so Tovu stops mailing that
address (a complaint stops newsletters only; sign-in links still go out).

1. In Resend, **Webhooks**, add the endpoint `https://<the site's public address>/hooks/mail/resend`
   with the events `email.bounced`, `email.complained` and `email.delivered`. Do this in the
   dashboard, not with the MCP tools: the signing secret must not pass through the chat.
2. Copy the endpoint's **signing secret** (it starts with `whsec_`). Never ask for it in chat.
3. Save it through the secure form: `credential_save { kind: "api", label: "Tovu Mail — Resend
   Webhook Secret", baseUrl: "https://api.resend.com", category: "ops" }`.
4. **Rotating it:** rename the saved one to `Tovu Mail — Resend Webhook Secret (previous)`, save the
   new one under the label above, then delete the previous one once Resend uses only the new secret.

Without a saved secret the endpoint answers 503 and Resend retries later; nothing is lost while it is
being set up.
