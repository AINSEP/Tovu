import { randomBytes } from "node:crypto";
import { openWithPassphrase, sealWithPassphrase, type KeyringPort, type SecretSealerPort } from "@jini-ai/platform/secrets";
import { captureVaultArchive, prepareVaultArchiveRestore, type VaultArchiveEntry, type VaultRepoPort, type SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import { validateValueAgainstSchema, type SettingsRepoPort, type SettingDefinitionRecord } from "@jini-ai/core/settings";
import type { JsonValue } from "@jini-ai/core/primitives";
import { rebindApiConnectionArchive } from "../api-connections/vault-stores.js";
import type { SiteSavedKeysPort } from "./saved-keys-port.js";

/** All stores use the existing vault/settings owners. Composition supplies snapshot isolation,
 * attachment filtering and one transaction shared by both repositories. */
export interface SavedKeysStore {
  workspaceId: string;
  repo: VaultRepoPort;
  vault: SecretsVaultService;
  settings: SettingsRepoPort;
  transaction<T>(required: { run: () => Promise<T> }): Promise<T>;
  close(): Promise<void>;
}
export interface SiteSavedKeysDeps {
  workspaceId: string;
  keyring: KeyringPort;
  sealer: SecretSealerPort;
  openSnapshot(required: { snapshot: Buffer; workspaceId: string }): Promise<SavedKeysStore>;
  /** This callback runs in a consistent read of the attachment-filtered project store. */
  captureProject?<T>(required: { run: (store: Pick<SavedKeysStore, "workspaceId" | "repo" | "vault">) => Promise<T> }): Promise<T>;
  openRecipient(required: { siteId: string; dir: string; dbPath: string }): Promise<SavedKeysStore>;
  /** Definitions registered by this host, never declarations supplied by the optional bundle. */
  trustedDefinitions(): Promise<readonly SettingDefinitionRecord[]>;
}
interface SavedSetting { namespace: string; key: string; value: JsonValue }
interface SavedPayload { format: "tovu-site-saved-keys"; version: 1; credentials: VaultArchiveEntry[]; settings: SavedSetting[] }
const KINDS = ["site-assistant", "media-provider", "vendor", "custom", "source-control", "publish-peer", "database-destination", "api-connection"] as const;
const LEFT_OUT = "Saved keys were left out. Supply the correct saved keys password to restore them.";

/** Authenticate both registry identity dimensions so rows cannot be swapped between exports. */
function passwordAad({ shareId, workspaceId }: { shareId: string; workspaceId: string }): string {
  // Tuple encoding cannot alias IDs containing separators, and the domain prevents vault reuse.
  return JSON.stringify(["tovu-share-password", 1, workspaceId, shareId]);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** User/global settings and definition history never enter this site-specific transport. */
function portableDefinition(definition: SettingDefinitionRecord): boolean {
  return definition.secret && definition.status === "active" && Boolean(definition.scopes & 2);
}

/** Read only current values matching active secret definitions in the exact content snapshot. */
async function captureSettings(store: SavedKeysStore): Promise<{ values: SavedSetting[]; notices: string[] }> {
  const definitions = [...await store.settings.listActiveDefinitions({ workspaceId: null }), ...await store.settings.listActiveDefinitions({ workspaceId: store.workspaceId })];
  const found: SavedSetting[] = [];
  let omitted = 0;
  for (const def of definitions.filter(portableDefinition)) {
    const value = await store.settings.getWorkspaceValue({ workspaceId: store.workspaceId, settingId: def.settingId });
    if (value?.state !== "set") continue;
    if (value.defVersion === def.version && validateValueAgainstSchema(def.schema, value.valueJson)) {
      found.push({ namespace: def.namespace, key: def.key, value: value.valueJson });
    } else omitted++;
  }
  return { values: found, notices: omitted ? [`${omitted} saved setting(s) could not be validated and were left out.`] : [] };
}

/** Raw enumeration isolates invalid metadata before the owning service validates each row.
 * All payloads retain the source repo's find/attachment checks; no raw envelopes travel.
 */
async function captureStore(store: Pick<SavedKeysStore, "workspaceId" | "repo" | "vault">): Promise<{ entries: VaultArchiveEntry[]; notices: string[] }> {
  const queries = KINDS.map(kind => ({ workspaceId: store.workspaceId, kind, ownerKey: "tovu", principalId: null }));
  return captureVaultArchive({ vault: store.vault, repo: store.repo, queries });
}

/** Flatten the attachment-filtered project store while retaining existing site override semantics. */
function effectiveCredentials(site: VaultArchiveEntry[], project: VaultArchiveEntry[]): VaultArchiveEntry[] {
  // Site labels are the existing override contract; subtype separates unified custom/vendor rows.
  const key = (row: VaultArchiveEntry) => JSON.stringify([row.kind, row.ownerKey, row.meta.credentialType ?? null, row.label]);
  const siteLabels = new Set(site.map(key)), ids = new Set(site.map(row => row.id));
  const group = (row: VaultArchiveEntry) => JSON.stringify([row.kind, row.ownerKey, row.provider]);
  const defaults = new Set(site.filter(row => row.isDefault).map(group));
  // Flattening two stores must preserve the site's provider-default precedence as well as labels.
  const attached = project.filter(row => !siteLabels.has(key(row)) && !ids.has(row.id))
    .map(row => defaults.has(group(row)) ? { ...row, isDefault: false } : row);
  return [...site, ...attached];
}

/** A failed project store must not withhold healthy site keys; diagnostics never echo its error. */
async function captureAttachedProject(deps: SiteSavedKeysDeps) {
  if (!deps.captureProject) return { entries: [], notices: [] };
  try { return await deps.captureProject({ run: captureStore }); }
  catch { return { entries: [], notices: ["Attached project credentials could not be read and were left out."] }; }
}

/** Authenticate first, then validate the bounded logical format before any recipient resource opens. */
function readPayload(text: string): SavedPayload {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || parsed.format !== "tovu-site-saved-keys" || parsed.version !== 1) throw new Error("Invalid saved keys payload");
  assertCollection(parsed.credentials);
  assertCollection(parsed.settings);
  for (const row of parsed.credentials) validateCredential(row);
  for (const row of parsed.settings) validateSetting(row);
  return parsed as unknown as SavedPayload;
}
function assertCollection(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error("Invalid saved keys collection");
}
function validateSetting(row: unknown): void {
  if (!isObject(row) || typeof row.namespace !== "string" || typeof row.key !== "string" || !Object.hasOwn(row, "value")) throw new Error("Invalid saved setting");
}
function nullableString(value: unknown): boolean { return value === null || typeof value === "string"; }
function validateCredential(row: unknown): void {
  if (!isObject(row) || !KINDS.includes(row.kind as typeof KINDS[number])) throw new Error("Invalid saved credential");
  validateCredentialIdentity(row);
  if (!isObject(row.meta) || !(row.payload === null || isObject(row.payload))) throw new Error("Invalid saved credential");
}
function validateCredentialIdentity(row: Record<string, unknown>): void {
  if (row.ownerKey !== "tovu" || typeof row.id !== "string" || typeof row.label !== "string" || typeof row.isDefault !== "boolean") throw new Error("Invalid saved credential");
  if (!nullableString(row.binding) || !nullableString(row.provider)) throw new Error("Invalid saved credential");
}

/** An archive can supply values, never a definition/schema or a new executable configuration owner. */
function prepareSettings(required: { values: SavedSetting[]; store: SavedKeysStore; trusted: readonly SettingDefinitionRecord[] }) {
  const seen = new Set<string>();
  return required.values.map(value => {
    const definition = required.trusted.find(def => def.namespace === value.namespace && def.key === value.key && portableDefinition(def));
    if (!definition || !validateValueAgainstSchema(definition.schema, value.value)) throw new Error("Untrusted saved setting");
    if (seen.has(definition.settingId)) throw new Error("Duplicate saved setting");
    seen.add(definition.settingId);
    return { definition: { ...definition, workspaceId: definition.workspaceId === null ? null : required.store.workspaceId }, value: value.value };
  });
}

/** Validate/re-seal outside the lock; publish all vault rows and current settings in one transaction. */
async function commitPayload(required: { payload: SavedPayload; store: SavedKeysStore; trusted: readonly SettingDefinitionRecord[] }): Promise<string[]> {
  const { store, payload } = required;
  const rebound = rebindApiConnectionArchive({ entries: payload.credentials, workspaceId: store.workspaceId });
  const credentials = rebound.entries.map(row => row.kind === "custom" ? { ...row, kind: "vendor" as const, meta: { ...row.meta, credentialType: "custom" } } : row);
  const records = await prepareVaultArchiveRestore({ vault: store.vault, workspaceId: store.workspaceId, entries: credentials });
  const settings = prepareSettings({ values: payload.settings, store, trusted: required.trusted });
  await store.transaction({ run: async () => {
    if (!store.repo.applyBatch) throw new Error("Atomic saved keys restore unavailable");
    await store.repo.applyBatch({ ops: records.map(record => ({ put: { record, expectedRevision: null } })) });
    for (const entry of settings) {
      await store.settings.saveDefinition(entry.definition);
      // Import current values only; a secret must never be appended to the revision ledger.
      await store.settings.saveWorkspaceValue({ settingId: entry.definition.settingId, workspaceId: store.workspaceId, scope: "workspace", principalId: null,
        valueJson: entry.value, state: "set", defVersion: entry.definition.version, seq: 0, updatedBy: "share", updatedAt: new Date().toISOString(), originPluginId: null });
    }
  } });
  return rebound.notices;
}

/** CMS-specific adapter; Jini owns crypto and vault lifecycle. Off exports never invoke capture.
 * Password generation uses exactly 24 CSPRNG bytes; only the encrypted envelope and site-sealed
 * password leave capture. Restore failures affect only optional keys, never ordinary content.
 * @example const keys = createSiteSavedKeys(ports); await keys.capture({ snapshot, workspaceId, shareId });
 * @complexity O(snapshot bytes + credentials/settings + bounded scrypt work).
 */
export function createSiteSavedKeys(deps: SiteSavedKeysDeps, _options: Record<string, never> = {}): SiteSavedKeysPort {
  return {
    async capture(input, options = {}) {
      options.signal?.throwIfAborted();
      if (input.workspaceId !== deps.workspaceId) throw new Error("Saved keys workspace mismatch");
      const source = await deps.openSnapshot(input);
      try {
        const site = await captureStore(source);
        const project = await captureAttachedProject(deps);
        const credentials = rebindApiConnectionArchive({ entries: effectiveCredentials(site.entries, project.entries), workspaceId: source.workspaceId });
        const settings = await captureSettings(source);
        const payload: SavedPayload = { format: "tovu-site-saved-keys", version: 1, credentials: credentials.entries, settings: settings.values };
        assertCollection(payload.credentials);
        assertCollection(payload.settings);
        const password = randomBytes(24).toString("base64url");
        const encryptedKeys = Buffer.from(await sealWithPassphrase({ payload: JSON.stringify(payload), passphrase: password }));
        const sealedPassword = await deps.sealer.seal({ plaintext: password, key: await deps.keyring.activeKey({}), aad: passwordAad(input) });
        options.signal?.throwIfAborted();
        return { encryptedKeys, sealedPassword, notices: [...site.notices, ...project.notices, ...credentials.notices, ...settings.notices] };
      } finally { await source.close(); }
    },
    async reveal(input) {
      if (input.workspaceId !== deps.workspaceId) throw new Error("Saved keys workspace mismatch");
      return { password: await deps.sealer.open({ sealed: input.sealedPassword }, { aad: passwordAad(input) }) };
    },
    async restore(input, options = {}) {
      options.signal?.throwIfAborted();
      if (!input.password) return { notices: [LEFT_OUT] };
      try {
        const payload = readPayload(await openWithPassphrase({ envelope: input.encryptedKeys.toString("utf8"), passphrase: input.password }));
        options.signal?.throwIfAborted();
        const target = await deps.openRecipient(input);
        try { return { notices: await commitPayload({ payload, store: target, trusted: await deps.trustedDefinitions() }) }; }
        finally { await target.close(); }
      } catch {
        options.signal?.throwIfAborted();
        // Never expose provider text, plaintext, passphrases or platform crypto diagnostics.
        return { notices: [LEFT_OUT] };
      }
    },
  };
}
