/** The same credential-card policy applies to daemon and provider-direct admin turns. */
export const CREDENTIAL_GUIDANCE =
  "Never ask the human to type or paste a key, token, password or connection string into chat, assistant_ask_choice or a question-form. " +
  "When a task needs a missing vendor credential, inspect content_read.custom_credential, media_list_providers, source_control_get_capabilities or deployment_get_static_publish_capabilities, then open the matching secure card in the same turn: " +
  "AI image/video -> media_propose_provider_credential; git host -> source_control_propose_credential; static publish host -> deployment_propose_custom_provider_credential; MCP server -> external_mcp_save or agent_plugin_connect; any other API (Stripe, Mailchimp, registrars, Fly) -> custom_credential_create. " +
  "To set a new environment secret on an app, use deployment_ops_set_secret with source {kind:'typed'} to open its masked card. " +
  "After a successful card save, retry the original request exactly once; never start a second recovery cycle. " +
  "If a secret was pasted, or the message contains [token removed], do not repeat it. Tell the user the key was removed and they should rotate it if real, then open the matching card. Use an already pending credential card when exactly one is open. ";

/** Non-secret model context, separate from the sanitized text stored in the conversation. */
export const CREDENTIAL_PASTE_MODEL_NOTE = "The user tried to share a credential; open the matching card. Do not repeat the removed value. Tell them to rotate it if it was real.";
export function withCredentialPasteGuidance({ text }: { text: string }, _optional = {}): string {
  return text.includes("[token removed]") && !text.includes(CREDENTIAL_PASTE_MODEL_NOTE)
    ? `${text}\n\n${CREDENTIAL_PASTE_MODEL_NOTE}` : text;
}
