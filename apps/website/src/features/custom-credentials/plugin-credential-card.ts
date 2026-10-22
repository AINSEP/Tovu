import type { SecretCardForm } from "@jini-ai/ui/mcp-ui/secret-card";

/**
 * @file A key card an installed plugin declares for its own provider (2026-10-22, starting with mail
 * providers). The generic "Save an API credential" card asks for a label, base URL, category and
 * deploy targets the person has no reason to know; a plugin that already knows them declares its own
 * card copy, and core fills the rest in on the server. The form carries ONE field, the token. The
 * label, base URL and category never travel through the iframe, so a submission cannot redirect the
 * key to another row. Core names no vendor: every word on the card comes from the plugin's descriptor.
 */

/** One plugin-declared key card, already resolved to the saved row it fills. */
export interface PluginCredentialCard {
  /** Provider id the assistant passes as `target` (e.g. a mail provider's id). */
  readonly providerId: string;
  /** Exact saved-credential label the plugin's adapter reads. */
  readonly label: string;
  readonly category: string;
  readonly baseUrl: string;
  readonly title: string;
  readonly intro?: string;
  readonly helpUrl?: string;
  readonly helpLabel?: string;
  /** Hint under the key field, e.g. which access the key needs. */
  readonly keyHint?: string;
}

/** Composition-supplied loader; absent when no plugin catalog can declare cards here. */
export type LoadPluginCredentialCards = (workspaceId: string) => Promise<readonly PluginCredentialCard[]>;

/**
 * Renders a plugin's key card: its title, intro and help link above one masked token field.
 * The help link is a detail row (the form surface has no link control), and the saved label is
 * shown so the person can find the row later under Access Tokens.
 *
 * @complexity O(1) — a fixed one-field form.
 */
export function buildPluginCredentialForm({ card }: { card: PluginCredentialCard }, _optional = {}): SecretCardForm & { preferredFrameSize: readonly [string, string] } {
  return {
    title: card.title,
    description: `${card.intro ? `${card.intro} ` : ""}The key is sealed on the server the moment you submit — the assistant never sees it.`,
    details: [
      ...(card.helpUrl ? [{ label: card.helpLabel ?? "Get a key", value: card.helpUrl }] : []),
      { label: "Saved as", value: card.label },
    ],
    submitLabel: "Save key",
    fields: [{
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
