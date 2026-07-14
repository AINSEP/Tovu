import type { JsonValue } from "../../core/ports";
import { DefinitionInvalidError, SecretNotSupportedError } from "./errors";
import type { SettingsRepoPort } from "./ports";
import {
  SCOPE_BIT,
  type SettingDefinitionRecord,
  type SettingOwnerKind,
  type SettingScopeContext,
  type SettingValueRecord,
  type SettingValueSchema,
} from "./types";

/**
 * @file The settings resolver + pure definition-registration validation
 * (SPEC-007 REQ-02, REQ-03, REQ-09; ADR-028 §8's "one evaluator").
 *
 * Purpose:
 * `validateDefinitionInput` is pure (no I/O) — the write-side chokepoint in
 * `write-service.ts` calls it before persisting. `getEffective`/`getLayer`/
 * `resolveDefinition` are read-only against `SettingsRepoPort`. Neither
 * mutates anything; every mutation goes through `write-service.ts`.
 */

export interface DefinitionInput {
  namespace: string;
  key: string;
  ownerKind: SettingOwnerKind;
  workspaceId: string | null;
  ownerId?: string | null;
  schema: SettingValueSchema;
  defaultValue: JsonValue | null;
  scopes: number;
  secret: boolean;
}

const NAMESPACE_FENCE: Record<SettingOwnerKind, (input: DefinitionInput) => boolean> = {
  core: (input) => input.namespace.startsWith("core.") && input.workspaceId === null,
  theme: (input) => input.namespace.startsWith("theme.") && input.workspaceId === null,
  site: (input) => input.namespace.startsWith("site.") && input.workspaceId !== null,
};

/**
 * REQ-02/REQ-09/INV-05/INV-08 — the pure half of `registerDefinitions`.
 * Never throws; returns a discriminated result so the chokepoint decides how
 * to surface the failure (matches `ValueValidationFailedError`'s pattern of
 * keeping I/O out of validation).
 *
 * @complexity O(1) per definition.
 * @overallScore 100
 */
export function validateDefinitionInput(
  input: DefinitionInput
): { valid: true } | { valid: false; error: DefinitionInvalidError | SecretNotSupportedError } {
  if (input.secret) {
    return {
      valid: false,
      error: new SecretNotSupportedError(
        "secret:true definitions are not supported in the core-only subset (REQ-09/INV-08)"
      ),
    };
  }

  if (!NAMESPACE_FENCE[input.ownerKind](input)) {
    return {
      valid: false,
      error: new DefinitionInvalidError(
        `namespace '${input.namespace}' does not match the owner fence for owner_kind '${input.ownerKind}' (REQ-02)`
      ),
    };
  }

  if (input.scopes < 1 || input.scopes > 7) {
    return {
      valid: false,
      error: new DefinitionInvalidError(`scopes bitmask ${input.scopes} is out of range 1..7`),
    };
  }

  // INV-05: a site-owned def (workspace_id NOT NULL) may never declare the global scope bit.
  if (input.workspaceId !== null && (input.scopes & SCOPE_BIT.global) !== 0) {
    return {
      valid: false,
      error: new DefinitionInvalidError(
        "a site-owned definition may not declare the global scope bit (INV-05)"
      ),
    };
  }

  // Totality (behavior.spec §3): every non-secret def needs a non-null default so
  // getEffective is always total (INV-02) and factory-reset is provably bootable.
  if (input.defaultValue === null) {
    return {
      valid: false,
      error: new DefinitionInvalidError(
        "non-secret definitions require a non-null default_json (totality, INV-02)"
      ),
    };
  }

  return { valid: true };
}

export function validateValueAgainstSchema(schema: SettingValueSchema, value: JsonValue): boolean {
  if (value === null) return schema.nullable === true;
  switch (schema.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && schema.values.includes(value);
    case "json":
      // ADR-PIPE-008 Decision §3: any JSON value is accepted; internal shape/
      // length validation is the registering feature's own write-path job.
      return true;
  }
}

/** Identity-registry of total coercers keyed by `coercionTag` (EC-08). `"identity"` is always registered. */
const coercers = new Map<string, (value: JsonValue) => JsonValue>([["identity", (v) => v]]);

export function registerCoercer(tag: string, fn: (value: JsonValue) => JsonValue): void {
  coercers.set(tag, fn);
}

/**
 * Per-layer effective-read cache + workspace-qualified definition cache
 * (SPEC-007 REQ-12, AC-19/AC-20; ADR-028 §8 "Cache, definition cache, and
 * API").
 *
 * Shape, straight from ADR-028 §8:
 * - Layer cache keys `settings:{global | ws:{wsId} | user:{wsId}:{pid}}:{ns}`
 *   each hold a per-namespace map of `key -> SettingValueRecord|null`;
 *   `getEffective` merges up to 3 of these in memory. A value write
 *   invalidates exactly ONE such key — no fan-out to other tenants/layers.
 * - The definition cache is itself workspace-qualified (`{wsId|"platform"}:
 *   {ns}:{key}`) — site-owned defs are per-workspace data, so ADR-007
 *   applies to the def cache too. A definition-lifecycle write bumps a
 *   per-namespace epoch folded into the definition-cache key (lazy
 *   invalidation — old-epoch entries are simply never looked up again,
 *   rather than being enumerated and deleted).
 *
 * Deviation from the ADR's prose, recorded here rather than blocking on it:
 * the store is kept in a `WeakMap<SettingsRepoPort, ...>` rather than one
 * flat module-global map. In production there is exactly one repo instance
 * for the process lifetime, so this is behaviorally identical to a single
 * shared cache; it additionally means two independent repo instances (e.g.
 * two unit tests, each constructing their own `InMemorySettingsRepo`) never
 * bleed cache state into each other without needing an explicit reset hook.
 * No TTL/max-size eviction — invalidation-driven only, matching the task's
 * "smallest reasonable call" guidance for a single-process in-memory cache
 * at this scale.
 */
interface SettingsCacheStore {
  /** `settings:{global|ws:<id>|user:<ws>:<pid>}:{namespace}` -> per-key value map. */
  layer: Map<string, Map<string, SettingValueRecord | null>>;
  /** `def:{workspaceId|"platform"}:{namespace}:{key}:e{epoch}` -> resolved definition (or null = confirmed absent). */
  definitions: Map<string, SettingDefinitionRecord | null>;
  /** namespace -> epoch, bumped by any definition-lifecycle write against that namespace. */
  epoch: Map<string, number>;
}

const cacheByRepo = new WeakMap<SettingsRepoPort, SettingsCacheStore>();

function getCacheStore(repo: SettingsRepoPort): SettingsCacheStore {
  let store = cacheByRepo.get(repo);
  if (!store) {
    store = { layer: new Map(), definitions: new Map(), epoch: new Map() };
    cacheByRepo.set(repo, store);
  }
  return store;
}

function namespaceEpoch(store: SettingsCacheStore, namespace: string): number {
  return store.epoch.get(namespace) ?? 0;
}

function workspaceCachePart(workspaceId: string | null | undefined): string {
  return workspaceId ?? "platform";
}

function globalLayerCacheKey(namespace: string): string {
  return `settings:global:${namespace}`;
}

function workspaceLayerCacheKey(workspaceId: string, namespace: string): string {
  return `settings:ws:${workspaceId}:${namespace}`;
}

function userLayerCacheKey(workspaceId: string, principalId: string, namespace: string): string {
  return `settings:user:${workspaceId}:${principalId}:${namespace}`;
}

function definitionCacheKey(workspaceId: string | null, namespace: string, key: string, epoch: number): string {
  return `def:${workspaceCachePart(workspaceId)}:${namespace}:${key}:e${epoch}`;
}

async function getCachedLayerValue(
  store: SettingsCacheStore,
  layerCacheKeyStr: string,
  key: string,
  fetch: () => Promise<SettingValueRecord | null>
): Promise<SettingValueRecord | null> {
  let bucket = store.layer.get(layerCacheKeyStr);
  if (!bucket) {
    bucket = new Map();
    store.layer.set(layerCacheKeyStr, bucket);
  }
  if (bucket.has(key)) return bucket.get(key)!;
  const fetched = await fetch();
  bucket.set(key, fetched);
  return fetched;
}

/** AC-19 — invalidates exactly the `settings:global:{namespace}` cache entry. No fan-out. */
export function invalidateGlobalValueCache(repo: SettingsRepoPort, namespace: string): void {
  getCacheStore(repo).layer.delete(globalLayerCacheKey(namespace));
}

/** AC-19 — invalidates exactly one workspace's cache entry for `namespace`. No fan-out to other workspaces. */
export function invalidateWorkspaceValueCache(repo: SettingsRepoPort, workspaceId: string, namespace: string): void {
  getCacheStore(repo).layer.delete(workspaceLayerCacheKey(workspaceId, namespace));
}

/** AC-19 — invalidates exactly one (workspace, principal) cache entry for `namespace`. No fan-out to other principals. */
export function invalidateUserValueCache(
  repo: SettingsRepoPort,
  workspaceId: string,
  principalId: string,
  namespace: string
): void {
  getCacheStore(repo).layer.delete(userLayerCacheKey(workspaceId, principalId, namespace));
}

/**
 * Bumps the namespace's definition-cache epoch (ADR-028 §8's lazy
 * invalidation) — every previously-cached definition-cache entry for this
 * namespace (across every workspace) becomes unreachable on the next read,
 * without needing to enumerate tenants. Call after any write that changes a
 * definition's identity/shape/status in this namespace: register, rename
 * (both the old and new namespace), retype, deprecate, tombstone.
 */
export function invalidateDefinitionNamespaceCache(repo: SettingsRepoPort, namespace: string): void {
  const store = getCacheStore(repo);
  store.epoch.set(namespace, namespaceEpoch(store, namespace) + 1);
}

/**
 * Purge support: a tenant/principal teardown deletes an unbounded number of
 * value rows across an unknown set of namespaces, so per-namespace
 * single-key invalidation (as used by `set`/`clear`) isn't practical here.
 * Clears every workspace-scope and (if `principalId` given) that principal's
 * user-scope layer-cache entry; global-scope entries are untouched (purge
 * never deletes global rows) and other principals' user-scope entries are
 * untouched when `principalId` is given (no fan-out).
 */
export function invalidateWorkspaceSettingsCache(repo: SettingsRepoPort, workspaceId: string, principalId?: string): void {
  const store = getCacheStore(repo);
  if (principalId) {
    const prefix = `settings:user:${workspaceId}:${principalId}:`;
    for (const k of [...store.layer.keys()]) {
      if (k.startsWith(prefix)) store.layer.delete(k);
    }
    return;
  }
  const workspacePrefix = `settings:ws:${workspaceId}:`;
  const userPrefix = `settings:user:${workspaceId}:`;
  for (const k of [...store.layer.keys()]) {
    if (k.startsWith(workspacePrefix) || k.startsWith(userPrefix)) store.layer.delete(k);
  }
}

/**
 * Follows an alias marker (depth <=1) to the current row and returns it as
 * stored — status intact, including `tombstone`. `resolveDefinition` (below)
 * is the read-path wrapper that collapses tombstone to typed-absent (EC-10);
 * `write-service.ts` uses this raw form directly so it can report
 * `DEFINITION_TOMBSTONED` distinctly from "not found".
 */
export async function resolveDefinitionRaw(
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; workspaceId: string | null }
): Promise<SettingDefinitionRecord | null> {
  // Namespace fencing (REQ-02) makes `site.*` (non-null workspace_id) and
  // `core.*`/`theme.*` (null workspace_id) disjoint by construction, so a
  // caller resolving inside a workspace context may still be asking for a
  // platform definition. Try the caller's own partition first, then fall
  // back to the platform (null) partition.
  const found =
    (await deps.repo.findActiveDefinition(input)) ??
    (input.workspaceId !== null
      ? await deps.repo.findActiveDefinition({ ...input, workspaceId: null })
      : null);
  if (!found) return null;
  if (found.status === "alias") {
    if (found.aliasOfNamespace == null || found.aliasOfKey == null) return null;
    return resolveDefinitionRaw(deps, {
      namespace: found.aliasOfNamespace,
      key: found.aliasOfKey,
      workspaceId: input.workspaceId,
    });
  }
  return found;
}

/**
 * REQ-03 — the read-path resolver: typed-absent (`null`) for a tombstoned or
 * missing key (EC-10). Cached (AC-19/AC-20, ADR-028 §8) — keyed by
 * `(workspaceId, namespace, key, namespace-epoch)`, so it is workspace-
 * qualified by construction (AC-20) and invalidated wholesale by
 * `invalidateDefinitionNamespaceCache` on any definition-lifecycle write
 * (register/rename/retype/deprecate/tombstone). `resolveDefinitionRaw`
 * itself stays uncached — the write chokepoint (`write-service.ts`) calls it
 * directly so authorization/validation decisions are always made against
 * live data, never a cached read.
 */
export async function resolveDefinition(
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; workspaceId: string | null }
): Promise<SettingDefinitionRecord | null> {
  const store = getCacheStore(deps.repo);
  const epoch = namespaceEpoch(store, input.namespace);
  const cacheKey = definitionCacheKey(input.workspaceId, input.namespace, input.key, epoch);
  if (store.definitions.has(cacheKey)) return store.definitions.get(cacheKey)!;

  const found = await resolveDefinitionRaw(deps, input);
  const resolved = !found || found.status === "tombstone" ? null : found;
  store.definitions.set(cacheKey, resolved);
  return resolved;
}

export interface ResolvedSetting {
  value: JsonValue | null;
  sourceLayer: "user" | "workspace" | "global" | "default";
  defVersion: number;
}

/**
 * REQ-03/INV-02 — total for a live key: never throws, never returns
 * undefined. Precedence `user ?? workspace ?? global ?? default`. A
 * `cleared` row is treated as absent at that layer (behavior.spec §1.2).
 *
 * Per-layer reads are cached (AC-19, ADR-028 §8): each of the (up to 3) raw
 * layer reads below goes through `getCachedLayerValue`, keyed by this
 * namespace's `settings:{global|ws:<id>|user:<ws>:<pid>}` bucket. `set`/
 * `clear`/`purgeTenantSettings` invalidate exactly the one bucket their write
 * touches (no fan-out).
 *
 * @complexity O(1) — up to 3 layer reads + 1 definition read.
 * @overallScore 100
 */
export async function getEffective(
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; scopeContext: SettingScopeContext }
): Promise<ResolvedSetting | null> {
  const definition = await resolveDefinition(deps, {
    namespace: input.namespace,
    key: input.key,
    workspaceId: input.scopeContext.workspaceId ?? null,
  });
  if (!definition) return null;

  const store = getCacheStore(deps.repo);

  const coerce = (value: JsonValue, defVersion: number): JsonValue => {
    if (defVersion === definition.version) return value;
    const coercer = coercers.get(definition.coercionTag ?? "identity") ?? coercers.get("identity")!;
    return coercer(value);
  };

  if (input.scopeContext.workspaceId && input.scopeContext.principalId) {
    const workspaceId = input.scopeContext.workspaceId;
    const principalId = input.scopeContext.principalId;
    const userValue = await getCachedLayerValue(
      store,
      userLayerCacheKey(workspaceId, principalId, input.namespace),
      input.key,
      () => deps.repo.getUserValue({ workspaceId, principalId, settingId: definition.settingId })
    );
    if (userValue && userValue.state === "set") {
      return {
        value: coerce(userValue.valueJson, userValue.defVersion),
        sourceLayer: "user",
        defVersion: definition.version,
      };
    }
  }

  if (input.scopeContext.workspaceId) {
    const workspaceId = input.scopeContext.workspaceId;
    const workspaceValue = await getCachedLayerValue(
      store,
      workspaceLayerCacheKey(workspaceId, input.namespace),
      input.key,
      () => deps.repo.getWorkspaceValue({ workspaceId, settingId: definition.settingId })
    );
    if (workspaceValue && workspaceValue.state === "set") {
      return {
        value: coerce(workspaceValue.valueJson, workspaceValue.defVersion),
        sourceLayer: "workspace",
        defVersion: definition.version,
      };
    }
  }

  const globalValue = await getCachedLayerValue(store, globalLayerCacheKey(input.namespace), input.key, () =>
    deps.repo.getGlobalValue(definition.settingId)
  );
  if (globalValue && globalValue.state === "set") {
    return {
      value: coerce(globalValue.valueJson, globalValue.defVersion),
      sourceLayer: "global",
      defVersion: definition.version,
    };
  }

  return { value: definition.defaultValue, sourceLayer: "default", defVersion: definition.version };
}
