import { useEffect, useRef, useState } from "react";

import { describeApiError, type AdminMediaProviderMap } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import type { Translate } from "../../../lib/dictionary-translator";
import { t as defaultT, accessTokensLoadErrorMessage, accessTokenSaveErrorMessage } from "../security-i18n";
import {
  OTHER_CREDENTIAL_STORES,
  accessTokenCategoryMatches,
  connectedAsFact,
  envNamesFact,
  maskedTailFact,
  mediaProviderLabel,
  otherCredentialMatchesQuery,
  type AccessTokenCategoryId,
  type OtherCredentialStoreInfo,
} from "../rules";
import { defaultOtherCredentialsPort } from "./other-credentials-dependencies.hooks";
import type { OtherCredentialsPort } from "./other-credentials-port.hooks";

/**
 * @file The Security page's Tier-2 controller — reads all six single-row/per-item credential stores
 * (`rules.ts`'s `OTHER_CREDENTIAL_STORES`) and exposes Replace/Remove for the four that support it
 * (`store.supportsReplace` — see that constant's own doc for why `composio-connector`/`external-mcp`
 * don't). Sibling to `use-access-tokens.hooks.ts` (Tier 1), not a merge with it: the two tiers read
 * from completely different endpoints with completely different wire shapes, and `AccessTokensTab.tsx`
 * is the one place that renders both controllers' `groups` as one visual list — see that file's
 * header for the 2026-08-16 owner ruling this split answers to.
 *
 * ## One `Promise.allSettled` fan-out, not six `useFetchQuery` mounts
 *
 * Every other hook in this app that reads more than one endpoint (`useAccessTokens` itself, two
 * stores) repeats `useFetchQuery` + a one-time `seededRef` per endpoint. Six stores would mean six
 * near-identical copies of that same eight-line shape for no behavioral difference — none of these
 * reads depend on each other, so there is nothing sequencing would buy. This hook fires all six GETs
 * together in one effect and settles them into one `StoreState` map instead; a single store's own
 * failure is captured on ITS OWN entry (`error`) rather than failing every store's read, which one
 * shared `useFetchQuery` call could not have done without inventing its own multi-key error shape.
 *
 * ## `query`/`category` are OWNED by `useAccessTokens`, not this hook
 *
 * The search box and category filter are one control each across both tiers (`AccessTokensTab.tsx`'s
 * own single list) — duplicating that state here would let Tier 1 and Tier 2 drift out of sync the
 * moment a caller forgot to keep two `query` values equal. This hook takes `filter` as a parameter
 * instead of owning `useState` for either value, the same "controlled from outside" shape a plain
 * `<input value onChange>` uses.
 */

export interface OtherCredentialRowState {
  /** `${storeId}:${itemId}` — stable across re-renders, and unique even though `media-provider`/
   *  `composio-connector`/`external-mcp` can each hold more than one item. */
  readonly key: string;
  readonly store: OtherCredentialStoreInfo;
  /** The specific item within a multi-item store (a provider id, connector id, or server id) — equal
   *  to `store.id` itself for the three single-scope stores, which only ever have one possible item. */
  readonly itemId: string;
  /** This row's own display name — the store's generic label for a single-scope store, or the
   *  item's own name (a media provider's catalog label, a connector's own name, an MCP server's own
   *  label) for a multi-item one. */
  readonly name: string;
  /** What `§10`'s "never a reveal control" ceiling actually allows showing — a masked tail, an
   *  OAuth account fact, or an environment-variable-name count. See `rules.ts`'s `maskedTailFact`/
   *  `connectedAsFact`/`envNamesFact`. */
  readonly valueFact: string;
  readonly updatedAt: string | null;
  readonly token: string;
  readonly saving: boolean;
  readonly error: string | null;
}

export interface OtherCredentialGroupState {
  readonly store: OtherCredentialStoreInfo;
  /** Already filtered against the active search query — mirrors
   *  `AccessTokenProviderGroupState.rows`'s exact contract in `use-access-tokens.hooks.ts`. */
  readonly rows: readonly OtherCredentialRowState[];
}

export interface OtherCredentialsController {
  /** One entry per {@link OTHER_CREDENTIAL_STORES} store whose category matches the active filter, in
   *  that fixed order — `undefined` until every store's first read has settled (success OR failure). */
  groups: readonly OtherCredentialGroupState[] | undefined;
  loadError: string | null;
  /** Configured items across all six stores, regardless of query or category — pairs with
   *  `AccessTokensController.totalCount` so `AccessTokensTab.tsx` can report one combined count. */
  totalCount: number;
  /** Configured items across all six stores that match the active search query, regardless of
   *  category — pairs with `AccessTokensController.matchCount` the same way. */
  matchCount: number;

  setDraftToken: (key: string, value: string) => void;
  replace: (row: OtherCredentialRowState) => Promise<void>;
  remove: (row: OtherCredentialRowState) => Promise<void>;

  t: Translate;
}

/** One store's raw read result — `items` is `undefined` until this SPECIFIC store's read settles
 *  (independent of every other store's), so a slow Composio call never blocks a fast BYOK one from
 *  rendering. `loadError` is this store's own failure, kept apart from every other store's so one
 *  down store never hides the rest. */
interface RawStoreItem {
  readonly itemId: string;
  readonly name: string;
  readonly valueFact: string;
  readonly updatedAt: string | null;
}
interface StoreState {
  readonly items: readonly RawStoreItem[] | undefined;
  readonly loadError: string | null;
}
function idleStoreState(): StoreState {
  return { items: undefined, loadError: null };
}

/** Reads one single-`apiKey` store's current value into its (0 or 1) row — `site-assistant`/
 *  `admin-byok`/`composio-project` all share this exact "isSet-or-configured, plus a bare tail"
 *  shape; only the three GET calls' own field names differ, which the three small readers below
 *  normalize before this shared mapper ever runs. @complexity O(1). */
function singleKeyItems(store: OtherCredentialStoreInfo, isSet: boolean, tail: string | null, updatedAt: string | null): RawStoreItem[] {
  if (!isSet) return [];
  return [{ itemId: store.id, name: store.label, valueFact: maskedTailFact(tail ?? ""), updatedAt }];
}

async function readSiteAssistant(port: OtherCredentialsPort, store: OtherCredentialStoreInfo): Promise<RawStoreItem[]> {
  const { data } = await port.getSiteAssistantCredential();
  return singleKeyItems(store, data.isSet, data.masked, data.updatedAt);
}
async function readAdminByok(port: OtherCredentialsPort, store: OtherCredentialStoreInfo): Promise<RawStoreItem[]> {
  const { data } = await port.getAdminByokCredential();
  return singleKeyItems(store, data.isSet, data.masked, data.updatedAt);
}
async function readComposioProject(port: OtherCredentialsPort, store: OtherCredentialStoreInfo): Promise<RawStoreItem[]> {
  const config = await port.getComposioConfig();
  return singleKeyItems(store, config.configured, config.apiKeyTail, null);
}
/** Every configured media-provider key — one row per provider whose `apiKeyConfigured` is true, not
 *  one row for the whole store (the owner's own mock names a SPECIFIC provider, "Cloudinary (media)",
 *  as its own row — see `rules.ts`'s `OtherCredentialStoreInfo.label` doc for the placeholder-vs-item
 *  heading split this produces). @complexity O(p) in this workspace's own (small) configured-provider
 *  count. */
async function readMediaProviders(port: OtherCredentialsPort): Promise<RawStoreItem[]> {
  const map: AdminMediaProviderMap = await port.getMediaProviders();
  return Object.entries(map)
    .filter(([, credentials]) => credentials.apiKeyConfigured)
    .map(([providerId, credentials]) => ({
      itemId: providerId,
      name: mediaProviderLabel(providerId),
      valueFact: maskedTailFact(credentials.apiKeyTail ?? ""),
      updatedAt: null,
    }));
}
/** Every connected Composio account — status comes from the lightweight live-status map
 *  (`getConnectorStatuses`), names from the static catalog (`listConnectors`, no live call) — see
 *  `other-credentials-port.hooks.ts`'s own doc for why two reads beat one heavier live refetch here.
 *  @complexity O(c) in Composio's own (small) connector catalog size. */
async function readComposioConnectors(port: OtherCredentialsPort): Promise<RawStoreItem[]> {
  const [{ connectors }, statuses] = await Promise.all([port.listConnectors(), port.getConnectorStatuses()]);
  const nameById = new Map(connectors.map((connector) => [connector.id, connector.name]));
  return Object.entries(statuses)
    .filter(([, status]) => status.status === "connected" || status.status === "error")
    .map(([connectorId, status]) => ({
      itemId: connectorId,
      name: nameById.get(connectorId) ?? connectorId,
      valueFact: connectedAsFact(status.accountLabel),
      updatedAt: null,
    }));
}
/** Every configured external MCP server — @complexity O(s) in this workspace's own (small) server
 *  count. */
async function readExternalMcpServers(port: OtherCredentialsPort): Promise<RawStoreItem[]> {
  const { servers } = await port.listExternalMcpServers();
  return servers.map((server) => ({
    itemId: server.serverId,
    name: server.label || server.serverId,
    valueFact: envNamesFact(server.envNames),
    updatedAt: null,
  }));
}

/** Dispatches one store's read by id — the one place `OtherCredentialStoreId` is switched over for
 *  reads, mirroring `rules.ts`'s `buildAccessTokenConnectionInput` dispatch-by-kind pattern.
 *  @complexity O(1) plus whichever reader's own complexity. */
function readStore(port: OtherCredentialsPort, store: OtherCredentialStoreInfo): Promise<RawStoreItem[]> {
  switch (store.id) {
    case "site-assistant":
      return readSiteAssistant(port, store);
    case "admin-byok":
      return readAdminByok(port, store);
    case "media-provider":
      return readMediaProviders(port);
    case "composio-project":
      return readComposioProject(port, store);
    case "composio-connector":
      return readComposioConnectors(port);
    case "external-mcp":
      return readExternalMcpServers(port);
  }
}

/** Builds the full `{apiKey?, baseUrl?, model?}` map to PUT back for a media-provider Replace/Remove
 *  — every OTHER provider's entry is included as `{}` (blank `apiKey` PRESERVES the stored key,
 *  `put-providers.ts`'s own doc), and the target provider carries either its new key (Replace) or is
 *  omitted entirely (Remove, which the caller expresses by passing `nextApiKey: undefined` AND
 *  `remove: true` — see {@link replaceMediaProviderKey}/{@link removeMediaProviderKey}).
 *  @complexity O(p) in this workspace's own (small) configured-provider count. */
function rebuildMediaProviderMap(current: AdminMediaProviderMap, providerId: string, patch: { apiKey: string } | { remove: true }): AdminMediaProviderMap {
  const next: AdminMediaProviderMap = {};
  for (const id of Object.keys(current)) {
    if (id === providerId) continue;
    next[id] = {};
  }
  if (!("remove" in patch)) next[providerId] = { apiKey: patch.apiKey };
  return next;
}

/** Translates a rejected Tier-2 write into the same save-error string Tier 1 uses — no
 *  duplicate-label case here (nothing on this tier is named), so this is the plain
 *  `describeApiError`-wrapped base case only. @complexity O(1). */
function otherCredentialSaveErrorMessage(err: unknown, t: Translate, locale: string): string {
  return accessTokenSaveErrorMessage(locale, describeApiError(err, t("unknown error")));
}

export function useOtherCredentials(
  port: OtherCredentialsPort,
  t: Translate,
  locale: string,
  filter: { query: string; category: AccessTokenCategoryId }
): OtherCredentialsController {
  const [storeStates, setStoreStates] = useState<Record<string, StoreState>>(() =>
    Object.fromEntries(OTHER_CREDENTIAL_STORES.map((store) => [store.id, idleStoreState()]))
  );
  const [drafts, setDrafts] = useState<Record<string, { token: string; saving: boolean; error: string | null }>>({});

  // Fires once per mount — see this file's header for why six independent reads settle into one
  // effect instead of six `useFetchQuery` mounts. Each store's own result lands on its own map entry
  // as it settles, so a fast store renders before a slow one resolves.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    for (const store of OTHER_CREDENTIAL_STORES) {
      readStore(port, store)
        .then((items) => setStoreStates((prev) => ({ ...prev, [store.id]: { items, loadError: null } })))
        .catch((err: unknown) =>
          setStoreStates((prev) => ({
            ...prev,
            [store.id]: { items: [], loadError: accessTokensLoadErrorMessage(locale, describeApiError(err, t("unknown error"))) },
          }))
        );
    }
    // Intentionally empty deps beyond the mount guard above — `port`/`t`/`locale` are stable for the
    // lifetime of one mounted controller (bound once in `useWiredOtherCredentials`), matching
    // `useAccessTokens`'s own seed-once effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDraftToken(key: string, value: string): void {
    setDrafts((prev) => ({ ...prev, [key]: { token: value, saving: prev[key]?.saving ?? false, error: prev[key]?.error ?? null } }));
  }

  async function replace(row: OtherCredentialRowState): Promise<void> {
    const draft = drafts[row.key];
    const token = draft?.token.trim() ?? "";
    if (token === "" || !row.store.supportsReplace) return;
    setDrafts((prev) => ({ ...prev, [row.key]: { token, saving: true, error: null } }));
    try {
      await writeReplace(port, row.store.id, row.itemId, token);
      await refetchOne(port, row.store, setStoreStates);
      setDrafts((prev) => ({ ...prev, [row.key]: { token: "", saving: false, error: null } }));
    } catch (err) {
      setDrafts((prev) => ({ ...prev, [row.key]: { token, saving: false, error: otherCredentialSaveErrorMessage(err, t, locale) } }));
    }
  }

  async function remove(row: OtherCredentialRowState): Promise<void> {
    try {
      await writeRemove(port, row.store.id, row.itemId);
      await refetchOne(port, row.store, setStoreStates);
    } catch (err) {
      setDrafts((prev) => ({ ...prev, [row.key]: { token: prev[row.key]?.token ?? "", saving: false, error: otherCredentialSaveErrorMessage(err, t, locale) } }));
    }
  }

  const allSettled = OTHER_CREDENTIAL_STORES.every((store) => storeStates[store.id]?.items !== undefined);
  const firstLoadError = OTHER_CREDENTIAL_STORES.map((store) => storeStates[store.id]?.loadError).find((error) => error) ?? null;

  const groups: readonly OtherCredentialGroupState[] | undefined = allSettled
    ? OTHER_CREDENTIAL_STORES.filter((store) => accessTokenCategoryMatches(store.category, filter.category)).map((store) =>
        buildGroup(store, storeStates[store.id]?.items ?? [], drafts, filter.query)
      )
    : undefined;

  const totalCount = OTHER_CREDENTIAL_STORES.reduce((sum, store) => sum + (storeStates[store.id]?.items?.length ?? 0), 0);
  const matchCount = OTHER_CREDENTIAL_STORES.reduce((sum, store) => {
    const items = storeStates[store.id]?.items ?? [];
    return sum + items.filter((item) => otherCredentialMatchesQuery(store, item.name, filter.query)).length;
  }, 0);

  return { groups, loadError: firstLoadError, totalCount, matchCount, setDraftToken, replace, remove, t };
}

/** Builds one store's group — filters its raw items by the active search query, same
 *  `otherCredentialMatchesQuery` contract `AccessTokensTab.tsx`'s own visibility check applies to the
 *  (possibly still-empty) result. Pulled out of {@link useOtherCredentials} purely for the complexity
 *  gate. @complexity O(n) in this store's own (small) item count. */
function buildGroup(
  store: OtherCredentialStoreInfo,
  items: readonly RawStoreItem[],
  drafts: Record<string, { token: string; saving: boolean; error: string | null }>,
  query: string
): OtherCredentialGroupState {
  const rows = items
    .filter((item) => otherCredentialMatchesQuery(store, item.name, query))
    .map((item): OtherCredentialRowState => {
      const key = `${store.id}:${item.itemId}`;
      const draft = drafts[key];
      return {
        key,
        store,
        itemId: item.itemId,
        name: item.name,
        valueFact: item.valueFact,
        updatedAt: item.updatedAt,
        token: draft?.token ?? "",
        saving: draft?.saving ?? false,
        error: draft?.error ?? null,
      };
    });
  return { store, rows };
}

/** Re-reads one store after a successful write — Tier 2 has the same "a write can change more than
 *  the one field the form touched" reasoning `use-access-tokens.hooks.ts`'s own `removeToken`/
 *  `makeDefault` document for Tier 1, and every write here is already a full round trip (there is no
 *  optimistic splice to do instead — a media-provider Remove, for instance, has to know the CURRENT
 *  server-side map to rebuild it, so a stale local copy is not a safe base for a second consecutive
 *  write). @complexity O(1) plus whichever reader's own complexity. */
async function refetchOne(
  port: OtherCredentialsPort,
  store: OtherCredentialStoreInfo,
  setStoreStates: (updater: (prev: Record<string, StoreState>) => Record<string, StoreState>) => void
): Promise<void> {
  const items = await readStore(port, store);
  setStoreStates((prev) => ({ ...prev, [store.id]: { items, loadError: null } }));
}

/** Dispatches one store's Replace write — the one place `OtherCredentialStoreId` is switched over
 *  for writes. `media-provider` rebuilds the whole map first (see {@link rebuildMediaProviderMap});
 *  every other supported store is a direct single-field PUT. Throws for `composio-connector`/
 *  `external-mcp` — unreachable in practice (`replace` itself checks `supportsReplace` first), kept
 *  as a defensive fallthrough rather than a silent no-op so a future caller that skips that check
 *  fails loudly instead of quietly doing nothing. @complexity O(1) plus the media-provider rebuild's
 *  own O(p). */
async function writeReplace(port: OtherCredentialsPort, storeId: OtherCredentialStoreInfo["id"], itemId: string, apiKey: string): Promise<void> {
  if (storeId === "site-assistant") {
    await port.setSiteAssistantCredential({ apiKey });
    return;
  }
  if (storeId === "admin-byok") {
    await port.setAdminByokCredential({ apiKey });
    return;
  }
  if (storeId === "composio-project") {
    await port.saveComposioConfig(apiKey);
    return;
  }
  if (storeId === "media-provider") {
    const current = await port.getMediaProviders();
    await port.saveMediaProviders(rebuildMediaProviderMap(current, itemId, { apiKey }));
    return;
  }
  throw new Error(`${storeId} does not support Replace`);
}

/** Dispatches one store's Remove write — mirrors {@link writeReplace}'s dispatch, but every store
 *  here DOES support Remove (unlike Replace, §8/the owner ruling never narrows Remove to a subset).
 *  @complexity O(1) plus the media-provider rebuild's own O(p). */
async function writeRemove(port: OtherCredentialsPort, storeId: OtherCredentialStoreInfo["id"], itemId: string): Promise<void> {
  if (storeId === "site-assistant") {
    await port.deleteSiteAssistantCredential();
    return;
  }
  if (storeId === "admin-byok") {
    await port.deleteAdminByokCredential();
    return;
  }
  if (storeId === "composio-project") {
    await port.saveComposioConfig(null);
    return;
  }
  if (storeId === "media-provider") {
    const current = await port.getMediaProviders();
    await port.saveMediaProviders(rebuildMediaProviderMap(current, itemId, { remove: true }));
    return;
  }
  if (storeId === "composio-connector") {
    await port.disconnectConnector(itemId);
    return;
  }
  await port.deleteExternalMcpServer(itemId);
}

/**
 * Binds the real port, and a `t` bound to the real resolved locale — the zero-argument-except-filter
 * half of the `useX(dependencies)` / `useWiredX()` pair, same shape `useWiredAccessTokens` documents.
 * Takes `filter` because `query`/`category` are owned by `useAccessTokens` — see this file's header.
 */
export function useWiredOtherCredentials(filter: { query: string; category: AccessTokenCategoryId }): OtherCredentialsController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => defaultT(locale, key);
  return useOtherCredentials(defaultOtherCredentialsPort, boundT, locale, filter);
}
