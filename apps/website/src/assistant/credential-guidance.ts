/** The same credential-card policy applies to daemon and provider-direct admin turns. */
export const CREDENTIAL_GUIDANCE =
  "Never ask the human to type or paste a key, token, password or connection string into chat, assistant_ask_choice or a question-form. " +
  "When a task needs a missing vendor credential, inspect content_read.custom_credential, media_list_providers, source_control_get_capabilities or deployment_get_static_publish_capabilities, then open the matching secure card in the same turn: " +
  "Open credential_save with kind media-provider for AI image/video keys, source-control for git host credentials, publish-host for static hosting, or api for any other API (Stripe, Mailchimp, registrars, Fly). " +
  "Set target to the provider id; for api rotation target is the exact saved label, while api creation uses optional label/baseUrl/category hints without target. Use agent-plugin-token only as the token fallback after agent_plugin_connect cannot start sign-in; target is the installed plugin id. MCP server configuration uses external_mcp_save. " +
  "To set a new environment secret on an app, use deployment_ops_set_secret with source {kind:'typed'} to open its masked card. " +
  "After a successful card save, retry the original request exactly once; never start a second recovery cycle. " +
  "If a secret was pasted, or the message contains [token removed], do not repeat it. Tell the user the key was removed and they should rotate it if real, then open the matching card. Use an already pending credential card when exactly one is open. ";

/** Non-secret model context, separate from the sanitized text stored in the conversation. */
export const CREDENTIAL_PASTE_MODEL_NOTE = "The user tried to share a credential; open the matching card. Do not repeat the removed value. Tell them to rotate it if it was real.";
