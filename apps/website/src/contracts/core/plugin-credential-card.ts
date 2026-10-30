import type { SecretCardForm } from "@jini-ai/ui/mcp-ui/secret-card";

/**
 * @file A key card an installed plugin declares for its own provider (2026-10-22, starting with mail
 * providers). The generic "Save an API credential" card asks for a label, base URL, category and
 * deploy targets the person has no reason to know; a plugin that already knows them declares its own
 * card copy, and core fills the rest in on the server. The form carries a masked token plus
 * declared non-secret fields. Fixed labels, origins and categories remain server-owned, so a
 * submission cannot redirect the key to another row. Instance-specific origins are explicit fields. Core names no vendor: every word on the card comes from the plugin's descriptor.
 */

/** Extra public connection metadata, entered directly on the secure card. */
export interface PluginCredentialField {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly required?: boolean;
}

/** One plugin-declared key card, already resolved to the saved row it fills. */
export interface PluginCredentialCard {
  /** Declaring installed plugin, supplied by the trusted contribution loader. */
  readonly pluginId?: string;
  /** Provider id the assistant passes as `target` (e.g. a mail provider's id). */
  readonly providerId: string;
  /** API credential label, or the connection name for a domain-owned save. */
  readonly label: string;
  /** Explicit ownership of this API card's exact label; conflicting plugins are refused at merge. */
  readonly ownedApiLabel?: string;
  readonly category: string;
  readonly baseUrl: string;
  readonly title: string;
  readonly intro?: string;
  readonly helpUrl?: string;
  readonly helpLabel?: string;
  /** Hint under the key field, e.g. which access the key needs. */
  readonly keyHint?: string;
  /** Plain-text purposes for people and the assistant; never selects or authorizes a key in code. */
  readonly usedFor?: readonly string[];
  readonly fields?: readonly PluginCredentialField[];
  /** Optional read-only GET before sealing; absolute HTTPS on the declared baseUrl origin. */
  readonly probeUrl?: string;
  readonly additionalHosts?: readonly string[];
  /** Absent preserves the original mail/API save path. `provider-settings` saves a provider plugin's
   *  declared settings (saveTarget = that plugin's id; see provider-settings-card.ts). */
  readonly saveKind?: "api" | "publish-host" | "source-control" | "agent-plugin-token" | "oauth" | "provider-settings";
  readonly saveTarget?: string;
  /** Permissions explained on a hosted sign-in card; never grants authority itself. */
  readonly permissions?: string;
}

/**
 * Renders a plugin's key card: its title, intro and help link above declared public fields and one masked token field.
 * The help link is a detail row (the form surface has no link control), and the saved label is
 * shown so the person can find the row later under Access Tokens.
 *
 * @complexity O(f) declared public fields; mail retains its original one-field form.
 */
export function buildPluginCredentialForm({ card }: { card: PluginCredentialCard }, _optional = {}): SecretCardForm & { preferredFrameSize: readonly [string, string] } {
  return {
    title: card.title,
    description: `${card.intro ? card.intro + " " : ""}The key is sealed on the server the moment you submit — the assistant never sees it.`,
    details: pluginCardDetails({ card }),
    submitLabel: "Save key",
    fields: [...(card.fields ?? []).map(field => ({ kind: "string" as const, ...field })), {
      kind: "string",
      name: "token",
      label: "API key",
      hint: card.keyHint ?? "Paste the key here. It is never shown to the assistant.",
      required: true,
      secret: true,
    }],
    app: { appName: "tovu-plugin-credential-card", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  };
}

/** Apply plugin copy to an existing domain form, preserving its fields, update and blank-token rules.
 * Domain stores remain authoritative for connection validation. @complexity O(f) form fields.
 */
export function applyPluginCredentialCard({ card, form }: { card?: PluginCredentialCard; form: SecretCardForm }, _options = {}): SecretCardForm {
  if (!card) return form;
  const pluginForm = buildPluginCredentialForm({ card });
  return { ...form, title: pluginForm.title, description: form.description ? `${card.intro ?? ""} ${form.description}`.trim() : pluginForm.description, details: [...(form.details ?? []), ...(pluginForm.details ?? [])],
    fields: form.fields.map(field => field.kind === "string" && field.name === "token" && field.secret ? { ...field, hint: card.keyHint ?? field.hint } : field) };
}

/** API rows have a fixed label; domain owners choose their own connection identity. */
function pluginCardDetails({ card }: { card: PluginCredentialCard }, _options = {}): SecretCardForm['details'] {
  const help = card.helpUrl ? [{ label: card.helpLabel ?? 'Get a key', value: card.helpUrl }] : [];
  const details = [...help, ...(card.usedFor?.length ? [{ label: 'Used for', value: card.usedFor.join('; ') }] : [])];
  return card.saveKind && card.saveKind !== 'api' ? details : [...details, { label: 'Saved as', value: card.label }];
}
