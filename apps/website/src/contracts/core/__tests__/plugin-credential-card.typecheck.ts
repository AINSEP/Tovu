

/**
 * @file A key card an installed plugin declares for its own provider (2026-10-22, starting with mail
 * providers). The generic "Save an API credential" card asks for a label, base URL, category and
 * deploy targets the person has no reason to know; a plugin that already knows them declares its own
 * card copy, and core fills the rest in on the server. The form carries a masked token plus
 * declared non-secret fields. Fixed labels, origins and categories remain server-owned, so a
 * submission cannot redirect the key to another row. Instance-specific origins are explicit fields. Core names no vendor: every word on the card comes from the plugin's descriptor.
 */

/** Extra public connection metadata, entered directly on the secure card. */
export interface PinnedPluginCredentialField {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly required?: boolean;
}


/** One plugin-declared key card, already resolved to the saved row it fills. */
export interface PinnedPluginCredentialCard {
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
  readonly fields?: readonly PinnedPluginCredentialField[];
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
import type { PluginCredentialCard, PluginCredentialField } from '@jini-ai/core/contracts/credentials';
type Assert<T extends true> = T;
export type Compatibility = [Assert<PinnedPluginCredentialCard extends PluginCredentialCard ? true : false>, Assert<PluginCredentialCard extends PinnedPluginCredentialCard ? true : false>, Assert<PinnedPluginCredentialField extends PluginCredentialField ? true : false>, Assert<PluginCredentialField extends PinnedPluginCredentialField ? true : false>];
