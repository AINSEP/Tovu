import { CustomCredentialValidationError } from "./store.js";
import { assertCredentialFreeField } from "../../contracts/core/credential-token.js";
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
  /** Provider id the assistant passes as `target` (e.g. a mail provider's id). */
  readonly providerId: string;
  /** API credential label, or the connection name for a domain-owned save. */
  readonly label: string;
  readonly category: string;
  readonly baseUrl: string;
  readonly title: string;
  readonly intro?: string;
  readonly helpUrl?: string;
  readonly helpLabel?: string;
  /** Hint under the key field, e.g. which access the key needs. */
  readonly keyHint?: string;
  readonly fields?: readonly PluginCredentialField[];
  readonly additionalHosts?: readonly string[];
  /** Absent preserves the original mail/API save path. */
  readonly saveKind?: "api" | "publish-host" | "source-control" | "agent-plugin-token" | "oauth";
  readonly saveTarget?: string;
  /** Permissions explained on a hosted sign-in card; never grants authority itself. */
  readonly permissions?: string;
}

/** Composition-supplied loader; absent when no plugin catalog can declare cards here. */
export type LoadPluginCredentialCards = (workspaceId: string) => Promise<readonly PluginCredentialCard[]>;

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
    description: `${card.intro ? `${card.intro} ` : ""}The key is sealed on the server the moment you submit — the assistant never sees it.`,
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
  return { ...form, title: pluginForm.title, description: `${pluginForm.description} ${form.description ?? ""}`.trim(), details: pluginForm.details,
    fields: form.fields.map(field => field.kind === "string" && field.secret ? { ...field, hint: card.keyHint ?? field.hint } : field) };
}

/** Extract API inputs from the human card. Fixed destinations cannot be changed by form params.
 * Required public fields and dynamic HTTPS origins are checked before sealing. @complexity O(f).
 */
export function readPluginCredentialValues({ card, values }: { card: PluginCredentialCard; values: Readonly<Record<string, unknown>> }, _options = {}): {
  label: string; category: string; baseUrl: string; username?: string; token: string; additionalHosts?: readonly string[];
} {
  const publicValues = Object.fromEntries((card.fields ?? []).map(field => [field.name, readPublicField({ field, values })]));
  const baseUrl = card.baseUrl || publicValues.baseUrl || '';
  if (!card.baseUrl) assertHttpsInput({ value: baseUrl });
  return { label: card.label, category: card.category, baseUrl, username: publicValues.username,
    token: typeof values.token === 'string' ? values.token : '',
    ...(card.additionalHosts === undefined ? {} : { additionalHosts: card.additionalHosts }) };
}

/** Public fields share the existing credential-free-value invariant with other credential forms. */
function readPublicField({ field, values }: { field: PluginCredentialField; values: Readonly<Record<string, unknown>> }, _options = {}): string | undefined {
  const value = values[field.name];
  if (field.required && (typeof value !== 'string' || !value.trim())) throw new CustomCredentialValidationError(`${field.name} is required`);
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new CustomCredentialValidationError(`${field.name} must be text`);
  assertCredentialFreeField({ value, field: field.name });
  return value;
}

/** The API store permits HTTP for legacy rows; plugin-declared dynamic origins require HTTPS. */
function assertHttpsInput({ value }: { value: string }, _options = {}): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new CustomCredentialValidationError('Server URL must use HTTPS'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new CustomCredentialValidationError('Server URL must use HTTPS without credentials');
}

/** Resolve copy only for the matching domain and provider, never a similarly named card. */
export async function findPluginCredentialCard({ loadCards, workspaceId, saveKind, target }: {
  loadCards?: LoadPluginCredentialCards; workspaceId: string; saveKind: PluginCredentialCard['saveKind']; target: string;
}, _options = {}): Promise<PluginCredentialCard | undefined> {
  return (await loadCards?.(workspaceId))?.find(card => card.saveKind === saveKind && (card.saveTarget ?? card.providerId) === target);
}

/** API rows have a fixed label; domain owners choose their own connection identity. */
function pluginCardDetails({ card }: { card: PluginCredentialCard }, _options = {}): SecretCardForm['details'] {
  const help = card.helpUrl ? [{ label: card.helpLabel ?? 'Get a key', value: card.helpUrl }] : [];
  return card.saveKind && card.saveKind !== 'api' ? help : [...help, { label: 'Saved as', value: card.label }];
}
