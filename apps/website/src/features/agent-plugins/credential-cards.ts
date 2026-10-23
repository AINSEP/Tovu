import type { PluginContributionDefinition, PluginContributionParseResult } from '@jini-ai/agent-plugins/lifecycle';
import type { PluginCredentialCard, PluginCredentialField } from '../custom-credentials/plugin-credential-card.js';
import { CUSTOM_CREDENTIAL_CATEGORIES } from '../custom-credentials/types.js';

/** Data-only Tovu binding over Jini's trusted contribution lifecycle. No modules execute here. */
type RecordValue = Record<string, unknown>;
const recordOf = ({ value }: { value: unknown }, _options = {}): RecordValue | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : undefined;
const saveKinds = ['api', 'publish-host', 'source-control', 'agent-plugin-token', 'oauth'];

/** Bounded display text, never a submitted value. @complexity O(1). */
function text({ value, name, required = false }: { value: unknown; name: string; required?: boolean }, _options = {}): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error(`${name} must be non-empty text (at most 2000 characters)`);
  return value.trim();
}

/** Reject active URLs, embedded credentials and non-HTTPS origins in declarations. */
function httpsUrl({ value, name }: { value: unknown; name: string }, _options = {}): string | undefined {
  const result = text({ value, name });
  if (result === undefined) return undefined;
  const url = new URL(result);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${name} must be an HTTPS URL without credentials`);
  return result;
}

/** Non-secret supplemental inputs; domain owners still validate the submitted connection. */
function fieldsOf({ value }: { value: unknown }, _options = {}): readonly PluginCredentialField[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 16) throw new Error('fields must be an array of at most 16 non-secret fields');
  const seen = new Set<string>();
  return value.map(entry => {
    const field = recordOf({ value: entry });
    if (!field || field.secret !== undefined) throw new Error('extra fields must be non-secret');
    const name = text({ value: field.name, name: 'field.name', required: true })!;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name) || /token|password|secret|authorization|cookie/i.test(name) || seen.has(name)) throw new Error('invalid or duplicate non-secret field name');
    seen.add(name);
    if (field.required !== undefined && typeof field.required !== 'boolean') throw new Error('field.required must be boolean');
    return { name, label: text({ value: field.label, name: 'field.label', required: true })!, ...(field.hint === undefined ? {} : { hint: text({ value: field.hint, name: 'field.hint' })! }), ...(field.required === undefined ? {} : { required: field.required as boolean }) };
  });
}

/** Validate one declaration, leaving all labels and destinations under plugin ownership. */
function cardOf({ value }: { value: unknown }, _options = {}): PluginCredentialCard {
  const declaration = recordOf({ value });
  if (!declaration) throw new Error('credential card must be an object');
  return declaredCard({ value: declaration });
}

/** Materialize the already checked object through the shared field and identity validators. */
function declaredCard({ value }: { value: RecordValue }, _options = {}): PluginCredentialCard {
  const { target, category } = cardIdentity({ value });
  const fields = fieldsOf({ value: value.fields });
  const baseUrl = httpsUrl({ value: value.baseUrl, name: 'baseUrl' });
  validateCardFields({ value, fields, baseUrl });
  return { providerId: target, category, baseUrl: baseUrl ?? '', ...cardText({ value }), ...ownedApiLabelOf({ value }), ...(fields === undefined ? {} : { fields }), ...additionalOrigins({ value: value.additionalHosts }), ...(value.saveKind === undefined ? {} : { saveKind: value.saveKind as PluginCredentialCard['saveKind'] }) };
}

/** A card may claim only its own API row, never grant ownership to other cards or domain stores. */
function ownedApiLabelOf({ value }: { value: RecordValue }, _options = {}): Pick<PluginCredentialCard, 'ownedApiLabel'> {
  const ownedApiLabel = text({ value: value.ownedApiLabel, name: 'ownedApiLabel' });
  if (ownedApiLabel === undefined) return {};
  if (!isApiCard({ value }) || ownedApiLabel !== text({ value: value.label, name: 'label', required: true })) throw new Error('ownedApiLabel must match the API card label');
  return { ownedApiLabel };
}

/** Select only supported display metadata; unknown manifest keys never reach a form or store. */
function cardText({ value }: { value: RecordValue }, _options = {}): Pick<PluginCredentialCard, 'label' | 'title' | 'intro' | 'keyHint' | 'helpLabel' | 'helpUrl' | 'saveTarget' | 'permissions'> {
  const result: Record<string, string> = {};
  for (const name of ['label', 'title', 'intro', 'keyHint']) result[name] = text({ value: value[name], name, required: true })!;
  for (const name of ['helpLabel', 'saveTarget', 'permissions']) {
    const field = text({ value: value[name], name });
    if (field !== undefined) result[name] = field;
  }
  const helpUrl = httpsUrl({ value: value.helpUrl, name: 'helpUrl' });
  if (helpUrl !== undefined) result.helpUrl = helpUrl;
  return result as unknown as ReturnType<typeof cardText>;
}

/** Parse the generic extension, refusing the whole declaration batch on invalid or duplicate ids.
 * Absence is compatible with older plugins. @complexity O(c + f), capped at 32 cards × 16 fields.
 */
export function parsePluginCredentialCards({ raw }: { raw: string }, _options = {}): PluginContributionParseResult<PluginCredentialCard> {
  try {
    const manifest = recordOf({ value: JSON.parse(raw) });
    if (!manifest) throw new Error('plugin manifest must be an object');
    const extensions = recordOf({ value: manifest.extensions }) ?? {};
    const tovu = recordOf({ value: extensions.tovu }) ?? {};
    const descriptors = parseCardBatch({ value: tovu.credentialCards });
    return { ok: true, descriptors };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid credential cards' };
  }
}

/** Reuse Jini's active, trusted-package gate and contained manifest read. */
export const credentialCardsContribution: PluginContributionDefinition<PluginCredentialCard, PluginCredentialCard> = {
  filename: 'plugin.json', contribution: 'credential cards', kind: 'data',
  parse: input => parsePluginCredentialCards(input), load: ({ descriptor, plugin }) => ({ ...descriptor, pluginId: plugin.pluginId }),
};

/** Preserve mail objects and ordering; duplicate targets retain mail priority, while conflicting
 * API label owners are all refused. O(cards) time and space; no persistent ownership registry.
 */
export function mergePluginCredentialCards({ mailCards, manifestCards }: { mailCards: readonly PluginCredentialCard[]; manifestCards: readonly PluginCredentialCard[] }, options: { onRefusal?: (message: string) => void } = {}): readonly PluginCredentialCard[] {
  const cards = [...mailCards, ...manifestCards];
  const conflictingLabels = conflictingApiLabels({ cards });
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.providerId, (counts.get(card.providerId) ?? 0) + 1);
  const accepted = manifestCards.filter(card => {
    if (counts.get(card.providerId) === 1) return true;
    (options.onRefusal ?? console.warn)(`duplicate plugin credential card target '${card.providerId}' was refused`);
    return false;
  });
  return [...mailCards, ...accepted].filter(card => {
    if (!isApiCard({ value: card }) || !conflictingLabels.has(card.label)) return true;
    (options.onRefusal ?? console.warn)(`duplicate API credential label '${card.label}' from '${card.pluginId ?? card.providerId}' was refused`);
    return false;
  });
}

/** Compare effective API labels, including descriptor-backed mail cards, before discarding targets.
 * Distinct cards of one plugin may share its row; two plugins cannot. O(cards) time and space.
 */
function conflictingApiLabels({ cards }: { cards: readonly PluginCredentialCard[] }, _options = {}): ReadonlySet<string> {
  const owners = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const card of cards) {
    if (!isApiCard({ value: card })) continue;
    const owner = card.pluginId ?? card.providerId;
    if (owners.has(card.label) && owners.get(card.label) !== owner) conflicts.add(card.label);
    owners.set(card.label, owner);
  }
  return conflicts;
}

/** Validate collection bounds separately from manifest decoding. O(cards + fields). */
function parseCardBatch({ value }: { value: unknown }, _options = {}): readonly PluginCredentialCard[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) throw new Error('credentialCards must be an array of at most 32 cards');
  const descriptors = value.map(value => cardOf({ value }));
  if (new Set(descriptors.map(card => card.providerId)).size !== descriptors.length) throw new Error('duplicate credential card target');
  return descriptors;
}

/** Extra API origins are plugin metadata, never model or iframe input. */
function additionalOrigins({ value }: { value: unknown }, _options = {}): Pick<PluginCredentialCard, 'additionalHosts'> {
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.length > 8) throw new Error('additionalHosts must be at most eight HTTPS origins');
  return { additionalHosts: value.map(entry => {
    const url = httpsUrl({ value: entry, name: 'additionalHosts' });
    if (!url || new URL(url).origin !== url) throw new Error('additionalHosts must contain origins only');
    return url;
  }) };
}

/** Check target and store discriminants independently from optional form metadata. */
function cardIdentity({ value }: { value: RecordValue }, _options = {}): { target: string; category: string } {
  const target = text({ value: value.target, name: 'target', required: true })!;
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(target)) throw new Error('invalid card target');
  const category = text({ value: value.category, name: 'category', required: true })!;
  if (!CUSTOM_CREDENTIAL_CATEGORIES.includes(category as never)) throw new Error('invalid card category');
  if (value.saveKind !== undefined && !saveKinds.includes(value.saveKind as string)) throw new Error('invalid saveKind');
  if (value.saveTarget !== undefined && (typeof value.saveTarget !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(value.saveTarget))) throw new Error('invalid saveTarget');
  return { target, category };
}

/** API public inputs have corresponding store slots; domain-owned forms retain their own fields. */
function validateCardFields({ value, fields = [], baseUrl }: { value: RecordValue; fields?: readonly PluginCredentialField[]; baseUrl?: string }, _options = {}): void {
  if (!isApiCard({ value }) && fields.length) throw new Error('Only API cards may declare fields; domain forms own their inputs');
  if (!baseUrl && !fields.some(field => field.name === 'baseUrl' && field.required)) throw new Error('baseUrl or a required baseUrl field is required');
  if (isApiCard({ value }) && fields.some(field => !['username', 'baseUrl'].includes(field.name))) throw new Error('API cards support only username and baseUrl public fields');
}

/** Missing saveKind retains the original API-card contract. */
function isApiCard({ value }: { value: { saveKind?: unknown } }, _options = {}): boolean { return value.saveKind === undefined || value.saveKind === "api"; }
