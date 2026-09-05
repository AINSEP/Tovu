import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  describeApiError,
  type AdminCustomCredentialCategoryId,
  type AdminCustomCredentialSummary,
  type AdminPublishConnectionInput,
  type AdminPublishCredentialSummary,
  type AdminSourceControlConnectionInput,
  type AdminSourceControlCredentialSummary,
} from "@/lib/api";
import { useFetchQuery } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import {
  t as defaultT,
  accessTokenDuplicateNameMessage,
  accessTokenMakeDefaultErrorMessage,
  accessTokenRemoveErrorMessage,
  accessTokenSaveErrorMessage,
  accessTokensLoadErrorMessage,
} from "../security-i18n";
import {
  ACCESS_TOKENS_RESOURCE,
  ACCESS_TOKEN_PROVIDERS,
  accessTokenCategoryMatches,
  accessTokenNameTaken,
  accessTokenProviderInfo,
  accessTokenRowMatchesQuery,
  accessTokenRowProviderInfo,
  accessTokenRowReadyToSave,
  accessTokenRowsForProvider,
  accessTokenReplaceReadyToSave,
  buildAccessTokenConnectionInput,
  buildAccessTokenRows,
  buildAccessTokenUpdatePatch,
  buildAdditionalHostsInput,
  buildCustomCredentialRows,
  buildCustomCredentialUpdatePatch,
  buildCustomProviderConnectionInput,
  classifyAccessTokenSubmitError,
  customCredentialNameTaken,
  customCredentialReadyToSave,
  customCredentialReplaceReadyToSave,
  type AccessTokenCategoryId,
  type AccessTokenFormFields,
  type AccessTokenKind,
  type AccessTokenProviderInfo,
  type AccessTokenProviderRef,
  type AccessTokenRow,
  type AccessTokenRowCategoryId,
  type CustomCredentialFormFields,
} from "../rules";
import { defaultAccessTokensPort } from "./access-tokens-dependencies.hooks";
import type { AccessTokensPort } from "./access-tokens-port.hooks";

/**
 * @file The Access Tokens tab's controller — the ONE place that reads and writes BOTH
 * `publish_credential_sets` and `source_control_credential_sets`, merges them into one
 * `kind`-tagged row list, and exposes the multi-row Create/Replace/Remove/default-selection surface
 * neither origin store's own page ever built (`rules.ts`'s own header explains why: both origin
 * pages only ever created ONE — the default — row per provider; this hook is where "a second, third,
 * differently-scoped token" and "which saved token does a publish actually use" get a UI for the
 * first time).
 *
 * ## Two independent fetches, two independent seed-once effects
 *
 * Same `useFetchQuery` + one-time `seededRef` shape `usePublishCredentials`/
 * `useSourceControlCredentials` each already use — duplicated here (not factored into a shared
 * helper) because the two queries have different keys, different snapshot shapes
 * (`AdminPublishCredentialsSnapshot` carries `executionMode`, the source-control one does not), and
 * different failure modes to report independently in {@link AccessTokensController.loadError}.
 *
 * ## No write-on-load migration — the legacy label is display-only, computed fresh every render
 *
 * An earlier pass fired a best-effort `PUT .../:id` on load to rewrite every row still carrying the
 * sentinel label (`"default"`) either origin page ever wrote. That write was rejected before it
 * shipped, for four reasons: it mutates data on a plain page OPEN, which is a surprising thing for a
 * read to do; `(workspaceId, providerId, label)` is UNIQUE, so two tabs open at once (or a React
 * StrictMode double-invoke in dev) can race and one PUT loses to a 409 with nothing to show for it;
 * an install nobody ever opens this page on never migrates, so "v1 transfers the tokens" was never
 * actually true for every workspace; and a failed PUT during a page load has nowhere good to surface
 * an error for what the reader didn't even ask this screen to do. `rules.ts`'s `buildAccessTokenRows`
 * already computes {@link AccessTokenRow.name} correctly on every call — a legacy row reads with its
 * friendly computed name from the very first render, with zero writes, and a REAL label is only ever
 * persisted when a human renames, replaces, or creates a row through this page's own forms.
 *
 * ## The category filter narrows `groups`, not the search count
 *
 * `category`/`setCategory` gate which PROVIDERS even enter {@link groups} (a provider outside the
 * active category is dropped before the query filter ever runs, same as if it didn't exist this
 * render) — {@link AccessTokensController.totalCount}/`matchCount` stay a GLOBAL count across every
 * category on purpose: the search-count line answers "how many tokens does this install hold",
 * which should not silently change meaning depending on which category tab happens to be selected.
 *
 * ## Optimistic Create/Replace, refetch-on-write for Remove/Make-default
 *
 * Create/Replace splice their own known result into local state (one round trip), same pattern
 * `usePublishCredentials.save` uses. Remove and Make-default do NOT — both can change which OTHER row
 * in the same provider group is `isDefault` (delete promotes the most-recently-updated remaining row;
 * `store.ts`'s own invariant, not reimplemented here), so both re-fetch that ONE store's full list
 * after the write rather than duplicating the server's promotion rule client-side. This workspace's
 * saved-credential count is small (`PublishCredentialSetRepoPort.listByWorkspace`'s own doc), so the
 * extra round trip is cheap and correct beats fast-but-possibly-wrong here.
 */

interface DraftFields {
  readonly name: string;
  readonly token: string;
  readonly accountId: string;
  readonly username: string;
}
function blankDraft(): DraftFields {
  return { name: "", token: "", accountId: "", username: "" };
}

interface BusyState {
  readonly saving: boolean;
  readonly error: string | null;
}
const IDLE: BusyState = { saving: false, error: null };

interface AddFormEntry {
  readonly visible: boolean;
  readonly draft: DraftFields;
  readonly saving: boolean;
  readonly error: string | null;
}
function blankAddFormEntry(): AddFormEntry {
  return { visible: false, draft: blankDraft(), saving: false, error: null };
}

/** The standalone "Add custom provider" dialog's own draft — kept separate from {@link DraftFields}
 *  (used by the seven catalog providers' per-provider add forms) since it carries `category`/
 *  `baseUrl`, which nothing else in this hook's state shapes have. */
interface CustomDraftFields {
  readonly name: string;
  readonly category: AccessTokenRowCategoryId;
  readonly baseUrl: string;
  /** Raw textarea text — see `rules.ts`'s `CustomCredentialFormFields.additionalHosts` doc. */
  readonly additionalHosts: string;
  readonly token: string;
  readonly username: string;
}
function blankCustomDraft(): CustomDraftFields {
  return { name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "" };
}

/** The `addForms`/`existingDrafts` map key for one provider — a plain string join rather than a
 *  nested `Record<kind, Record<providerId, ...>>`, since every lookup already has both parts
 *  available and a flat map avoids an extra existence check on the outer key at every read.
 *  @complexity O(1). */
function addFormKey(ref: AccessTokenProviderRef): string {
  return `${ref.kind}:${ref.providerId}`;
}

export interface AccessTokenExistingRowState {
  readonly row: AccessTokenRow;
  readonly name: string;
  readonly token: string;
  readonly accountId: string;
  readonly username: string;
  readonly saving: boolean;
  readonly error: string | null;
}
/** Merges one saved row with its own draft/busy state — defaults name to the row's current display
 *  name (Replace's "current Name pre-filled" behavior) and username to the row's own saved username
 *  (2026-09-01: a custom row's `username` is now a plaintext read-model field, {@link
 *  AccessTokenRow.username}'s own doc), with Token/Account left blank, same "never read a secret
 *  back" posture every credential form in this app already has.
 *  @complexity O(1). */
function existingRowState(row: AccessTokenRow, draft: DraftFields | undefined, busy: BusyState | undefined): AccessTokenExistingRowState {
  const d = draft ?? { ...blankDraft(), name: row.name, username: row.username ?? "" };
  const b = busy ?? IDLE;
  return { row, name: d.name, token: d.token, accountId: d.accountId, username: d.username, saving: b.saving, error: b.error };
}

export interface AccessTokenAddFormState {
  readonly visible: boolean;
  readonly name: string;
  readonly token: string;
  readonly accountId: string;
  readonly username: string;
  readonly saving: boolean;
  readonly error: string | null;
}
/** @complexity O(1). */
function addFormState(entry: AddFormEntry | undefined): AccessTokenAddFormState {
  const e = entry ?? blankAddFormEntry();
  return { visible: e.visible, name: e.draft.name, token: e.draft.token, accountId: e.draft.accountId, username: e.draft.username, saving: e.saving, error: e.error };
}

export interface AccessTokenProviderGroupState {
  readonly info: AccessTokenProviderInfo;
  /** Already filtered against the active search query — see this file's header. */
  readonly rows: readonly AccessTokenExistingRowState[];
  readonly addForm: AccessTokenAddFormState;
}

/** The standalone "Add custom provider" dialog's own public state — a top-level controller field
 *  rather than a `ref`-keyed entry in {@link AccessTokenProviderGroupState.addForm}'s map, since a
 *  custom row is created with no existing provider group to attach the form to (this file's own
 *  header on why `"custom"` rows have no catalog entry at all). */
export interface AccessTokenCustomAddFormState {
  readonly name: string;
  readonly category: AccessTokenRowCategoryId;
  readonly baseUrl: string;
  readonly additionalHosts: string;
  readonly token: string;
  readonly username: string;
  readonly saving: boolean;
  readonly error: string | null;
}

export interface AccessTokensController {
  /** One entry per {@link ACCESS_TOKEN_PROVIDERS} provider, in that fixed order — `undefined` until
   *  BOTH stores' first load resolves. Unlike `PublishCredentialsController.rows`, a provider's own
   *  `rows` array here can hold more than one saved connection. */
  groups: readonly AccessTokenProviderGroupState[] | undefined;
  loadError: string | null;

  query: string;
  setQuery: (value: string) => void;
  /** The active category filter — `"all"` by default. See this file's header for why this narrows
   *  {@link groups} but not {@link totalCount}/{@link matchCount}. */
  category: AccessTokenCategoryId;
  setCategory: (value: AccessTokenCategoryId) => void;
  /** Every saved row across both stores, regardless of the active query OR category — the
   *  match-count line's denominator. */
  totalCount: number;
  /** Saved rows that match the active query, regardless of category — the match-count line's
   *  numerator; equals {@link totalCount} when `query` is blank. */
  matchCount: number;

  setExistingField: (rowId: string, patch: Partial<DraftFields>) => void;
  replaceToken: (row: AccessTokenRow) => Promise<void>;
  removeToken: (row: AccessTokenRow) => Promise<void>;
  makeDefault: (row: AccessTokenRow) => Promise<void>;

  openAddForm: (ref: AccessTokenProviderRef) => void;
  closeAddForm: (ref: AccessTokenProviderRef) => void;
  setAddField: (ref: AccessTokenProviderRef, patch: Partial<DraftFields>) => void;
  createToken: (ref: AccessTokenProviderRef) => Promise<void>;

  /** The "Add custom provider" dialog's own field state — see {@link AccessTokenCustomAddFormState}. */
  customAddForm: AccessTokenCustomAddFormState;
  setCustomAddField: (patch: Partial<CustomDraftFields>) => void;
  /** Clears the dialog's fields — called on Cancel and after a successful save; does not itself
   *  close the native `<dialog>` (the caller's own ref does that, same split
   *  {@link RemoveConfirmDialog} already draws between this hook's state and DOM visibility). */
  resetCustomAddForm: () => void;
  createCustomCredential: () => Promise<boolean>;

  t: Translate;
}

/** Translates a rejected create/update/delete into a form-ready string — pulled out of the hook body
 *  for the same complexity-budget reason `publishCredentialSubmitErrorMessage` documents in its own
 *  file. @complexity O(1). */
function accessTokenSubmitErrorMessage(err: unknown, t: Translate, locale: string, providerLabel: string, attemptedName: string): string {
  const classified = classifyAccessTokenSubmitError(err);
  if (classified.kind === "duplicate-label") return accessTokenDuplicateNameMessage(locale, attemptedName, providerLabel);
  if (classified.kind === "validation") return accessTokenSaveErrorMessage(locale, classified.detail);
  return accessTokenSaveErrorMessage(locale, describeApiError(err, t("unknown error")));
}

/** Translates a rejected remove/make-default into a row-ready string via `template` — the
 *  Remove/Make-default counterpart of {@link accessTokenSubmitErrorMessage}, kept separate rather
 *  than widened onto it: neither action has a "duplicate name"/"validation" failure mode to
 *  classify (`classifyAccessTokenSubmitError`'s two special cases are Create/Replace-only), so this
 *  is the plain `describeApiError` extraction alone, worded per-action by the caller's own template
 *  (Terra audit MEDIUM finding, 2026-08-19: neither action surfaced a rejected call at all before
 *  this fix). @complexity O(1). */
function accessTokenActionErrorMessage(err: unknown, t: Translate, locale: string, template: (locale: string, error: string) => string): string {
  return template(locale, describeApiError(err, t("unknown error")));
}

/** Combines the three independent list-fetch failures (publish, source-control, custom) into one
 *  user-facing message, publish taking priority — pulled out of the hook body for the same
 *  complexity-budget reason {@link accessTokenSubmitErrorMessage} documents. */
function accessTokensLoadError(
  publishError: unknown,
  sourceControlError: unknown,
  customError: unknown,
  t: Translate,
  locale: string
): string | null {
  if (publishError) return accessTokensLoadErrorMessage(locale, describeApiError(publishError, t("unknown error")));
  if (sourceControlError) return accessTokensLoadErrorMessage(locale, describeApiError(sourceControlError, t("unknown error")));
  if (customError) return accessTokensLoadErrorMessage(locale, describeApiError(customError, t("unknown error")));
  return null;
}

/** Returns the first rejected settlement's reason among `results`, or `undefined` if every one
 *  fulfilled — lets {@link reloadAllStores} surface a background reload's per-store failure to the
 *  user without going back to a `Promise.all` that would discard the OTHER two stores' successfully
 *  refreshed data just because one rejected (2026-09-05 Gemini audit, verified: a just-revoked token
 *  in a store that itself reloaded fine could keep rendering as active, because the ONE other
 *  store's transient failure erased all three). Priority matches {@link accessTokensLoadError}'s own
 *  publish-then-source-control-then-custom order, since `results` is always built in that order.
 *  @complexity O(n) in the settled-result count (always 3 here). */
function firstRejectionReason(results: readonly PromiseSettledResult<unknown>[]): unknown {
  return results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
}

/** Normalizes one store's update payload into the exact `{label?, connection?, isDefault?}` shape
 *  each port method wants, dispatching on `kind` — the one place a `connection`'s union type is cast
 *  down to the specific store's own type (see `rules.ts`'s `buildAccessTokenConnectionInput` doc for
 *  why this is safe). Split out of {@link useAccessTokens}'s action functions purely to keep each of
 *  those under this repo's complexity gate. */
async function writeCredential(
  port: AccessTokensPort,
  kind: AccessTokenKind,
  mode: { readonly type: "create"; readonly label: string } | { readonly type: "update"; readonly id: string },
  patch: { label?: string; connection?: AdminPublishConnectionInput | AdminSourceControlConnectionInput; isDefault?: boolean }
): Promise<AdminPublishCredentialSummary | AdminSourceControlCredentialSummary> {
  if (kind === "publish") {
    const connection = patch.connection as AdminPublishConnectionInput | undefined;
    return mode.type === "create"
      ? port.publish.create({ label: mode.label, connection: connection!, isDefault: patch.isDefault })
      : port.publish.update(mode.id, { ...patch, connection });
  }
  const connection = patch.connection as AdminSourceControlConnectionInput | undefined;
  return mode.type === "create"
    ? port.sourceControl.create({ label: mode.label, connection: connection!, isDefault: patch.isDefault })
    : port.sourceControl.update(mode.id, { ...patch, connection });
}

export function useAccessTokens(port: AccessTokensPort, t: Translate, locale: string): AccessTokensController {
  const publishQuery = useFetchQuery({ key: ["security", "publish-credentials"], fetch: () => port.publish.list() });
  const sourceControlQuery = useFetchQuery({ key: ["security", "source-control-credentials"], fetch: () => port.sourceControl.list() });
  const customQuery = useFetchQuery({ key: ["security", "custom-credentials"], fetch: () => port.custom.list() });
  const [publishCredentials, setPublishCredentials] = useState<AdminPublishCredentialSummary[] | undefined>(undefined);
  const [sourceControlCredentials, setSourceControlCredentials] = useState<AdminSourceControlCredentialSummary[] | undefined>(undefined);
  const [customCredentials, setCustomCredentials] = useState<AdminCustomCredentialSummary[] | undefined>(undefined);

  const publishSeededRef = useRef(false);
  useEffect(() => {
    if (publishSeededRef.current || publishQuery.status === "loading" || !publishQuery.data) return;
    publishSeededRef.current = true;
    setPublishCredentials(publishQuery.data.credentials);
  }, [publishQuery.status, publishQuery.data]);

  const sourceControlSeededRef = useRef(false);
  useEffect(() => {
    if (sourceControlSeededRef.current || sourceControlQuery.status === "loading" || !sourceControlQuery.data) return;
    sourceControlSeededRef.current = true;
    setSourceControlCredentials(sourceControlQuery.data.credentials);
  }, [sourceControlQuery.status, sourceControlQuery.data]);

  const customSeededRef = useRef(false);
  useEffect(() => {
    if (customSeededRef.current || customQuery.status === "loading" || !customQuery.data) return;
    customSeededRef.current = true;
    setCustomCredentials(customQuery.data.credentials);
  }, [customQuery.status, customQuery.data]);

  // Set from a background reload (below) — merged into `loadError` so a failed refresh is as
  // visible as a failed initial load, instead of the unhandled rejection this used to produce (LOW
  // audit finding, 2026-09-03: `reloadAllStores` awaited all three stores with no `catch`).
  const [reloadError, setReloadError] = useState<string | null>(null);
  // Flips true the first time ANY background reload completes (success or failure) — lets
  // `loadError` below stop consulting `publishQuery.error`/`sourceControlQuery.error`/
  // `customQuery.error` once a reload has run at all, since those three are frozen at whatever they
  // were on the INITIAL fetch and nothing ever clears them afterward (2026-09-05 Gemini audit,
  // verified: without this, an initial fetch failure showed a permanent error banner even after a
  // later background reload fixed the problem, because `accessTokensLoadError(...) ?? reloadError`
  // always prefers that stale, never-reset initial error over `reloadError`'s honest "no error"
  // `null` — reordering the `??` would not have helped, since a successful reload also produces
  // `null`, the exact value `??` treats as "keep checking further"; only gating on "has a reload
  // happened at all" tells the difference between "no reload has run yet" and "the last reload
  // succeeded").
  const [hasReloadedOnce, setHasReloadedOnce] = useState(false);
  // Monotonic per-attempt id (same shape as `use-widget-region-editor.hooks.ts`'s
  // `loadRequestIdRef`/`use-static-publish.hooks.ts`'s `previewGenerationRef`): a content-refresh
  // notification can fire again while a previous reload is still in flight (2026-09-05 Gemini audit,
  // verified: `useContentRefreshSubscription` invokes `triggerReload` — a fresh, ungated
  // `reloadAllStores()` call every time — with no de-dupe of overlapping reloads), and network
  // completion order does not have to match start order. Minted synchronously at the top of each
  // attempt, before the first `await`, so two reloads started back to back always mint in the order
  // they started even though both are `async`.
  const reloadGenerationRef = useRef(0);

  /**
   * Re-reads all three stores directly, bypassing `useFetchQuery`'s cache — an out-of-band write
   * (today `custom_credential_set_username`/`custom_credential_set_token`,
   * `apps/website/src/features/custom-credentials/agent-tools.ts`) has nothing to invalidate that
   * this hook would ever re-read: `publishQuery`/`sourceControlQuery`/`customQuery` only ever feed
   * the ONE-TIME seed effects above (`publishSeededRef` et al.), and every subsequent read this hook
   * shows the operator comes from `publishCredentials`/`sourceControlCredentials`/`customCredentials`
   * local state instead — the same reason `removeToken`/`makeDefault` already call
   * `port.*.list()`/`refetchStore` directly rather than `invalidate()`ing a query nothing re-seeds
   * from. Safe to overwrite unconditionally, unlike `use-settings-slice.hooks.ts`'s guarded
   * `refresh()`: a row's `existingDrafts`/`existingBusy` entry is keyed by row id in its OWN state,
   * not carried on the row itself, so replacing the row list here cannot clobber an operator's
   * in-progress edit or in-flight save the way overwriting a settings tab's single edited `value`
   * could.
   *
   * `Promise.allSettled`, not `Promise.all` (2026-09-05 Gemini audit, CONFIRMED): a `Promise.all`
   * rejects as soon as ANY of the three rejects, discarding the other two stores' already-resolved,
   * genuinely fresher results — a revoked token in a store that itself reloaded fine could keep
   * rendering as active because an unrelated store merely blipped. Each store here is applied
   * independently on its own success, and the first failure (if any) still surfaces through
   * `reloadError` via {@link firstRejectionReason} — no store's failure is silently swallowed, it
   * just no longer holds the other two hostage.
   *
   * Guarded by `reloadGenerationRef` (2026-09-05 Gemini audit, CONFIRMED): with no ordering guard, an
   * older reload that happens to resolve AFTER a newer one already committed its results would
   * overwrite the newer, correct data with its own now-stale snapshot. Every commit below (`if
   * (reloadGenerationRef.current !== requestGeneration) return;`) is skipped whenever a newer
   * `reloadAllStores()` call has started since this one began.
   *
   * No longer wrapped in `try`/`catch` (the per-store settlement above is what used to need it) —
   * `triggerReload` below still calls this fire-and-forget (`void reloadAllStores()`, required by
   * `useContentRefreshSubscription`'s `onRefresh: () => void` contract), but nothing in this function
   * can now throw: `Promise.allSettled` itself never rejects.
   */
  const reloadAllStores = useCallback(async () => {
    const requestGeneration = ++reloadGenerationRef.current;
    const results = await Promise.allSettled([port.publish.list(), port.sourceControl.list(), port.custom.list()]);
    if (reloadGenerationRef.current !== requestGeneration) return; // superseded by a newer reload
    const [publishResult, sourceControlResult, customResult] = results;
    if (publishResult.status === "fulfilled") setPublishCredentials(publishResult.value.credentials);
    if (sourceControlResult.status === "fulfilled") setSourceControlCredentials(sourceControlResult.value.credentials);
    if (customResult.status === "fulfilled") setCustomCredentials(customResult.value.credentials);
    const failureReason = firstRejectionReason(results);
    setReloadError(failureReason === undefined ? null : accessTokensLoadErrorMessage(locale, describeApiError(failureReason, t("unknown error"))));
    setHasReloadedOnce(true);
  }, [port, locale, t]);

  // Stable identity — see `use-media.hooks.ts`'s identical `invalidateList` note for why an inline
  // arrow here would resubscribe `useContentRefreshSubscription` on every render for no benefit.
  const triggerReload = useCallback(() => {
    void reloadAllStores();
  }, [reloadAllStores]);
  useContentRefreshSubscription(ACCESS_TOKENS_RESOURCE, triggerReload);

  // Once a reload has completed at least once, `reloadError` alone is authoritative — see
  // `hasReloadedOnce`'s own doc for why the initial-fetch errors below cannot be trusted past that
  // point (they are never reset). Before any reload, this is unchanged from before: the initial
  // load's own three-way priority, falling back to `reloadError` (still its initial `null`).
  const loadError = hasReloadedOnce
    ? reloadError
    : (accessTokensLoadError(publishQuery.error, sourceControlQuery.error, customQuery.error, t, locale) ?? reloadError);

  const rows = useMemo<AccessTokenRow[] | undefined>(() => {
    if (publishCredentials === undefined || sourceControlCredentials === undefined || customCredentials === undefined) return undefined;
    return [
      ...buildAccessTokenRows("publish", publishCredentials),
      ...buildAccessTokenRows("source-control", sourceControlCredentials),
      ...buildCustomCredentialRows(customCredentials),
    ];
  }, [publishCredentials, sourceControlCredentials, customCredentials]);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AccessTokenCategoryId>("all");
  const [existingDrafts, setExistingDrafts] = useState<Record<string, DraftFields>>({});
  const [existingBusy, setExistingBusy] = useState<Record<string, BusyState>>({});
  const [addForms, setAddForms] = useState<Record<string, AddFormEntry>>({});
  const [customAddDraft, setCustomAddDraft] = useState<CustomDraftFields>(blankCustomDraft());
  const [customAddBusy, setCustomAddBusy] = useState<BusyState>(IDLE);

  function mergeCredential(kind: AccessTokenKind, result: AdminPublishCredentialSummary | AdminSourceControlCredentialSummary, isNew: boolean): void {
    if (kind === "publish") {
      const row = result as AdminPublishCredentialSummary;
      setPublishCredentials((prev) => mergeRaw(prev ?? [], row, isNew));
    } else {
      const row = result as AdminSourceControlCredentialSummary;
      setSourceControlCredentials((prev) => mergeRaw(prev ?? [], row, isNew));
    }
  }

  async function refetchStore(kind: AccessTokenKind): Promise<void> {
    if (kind === "publish") setPublishCredentials((await port.publish.list()).credentials);
    else setSourceControlCredentials((await port.sourceControl.list()).credentials);
  }

  /** Seeds a row's FIRST draft update from the persisted row (name AND username included), not a
   *  blank draft — fixes a HIGH audit finding (2026-08-19 Codex sol bug/architecture audit): the
   *  previous `prev[rowId] ?? blankDraft()` fallback seeded `name: ""` whenever Token/Account/Username
   *  was the first field touched, so the very next render displayed a cleared Name field and disabled
   *  Save until the user retyped it — see {@link existingRowState}'s own analogous, already-correct
   *  fallback (`row.name`), which this now matches. Username joined this same fallback on 2026-09-01:
   *  once a custom row can carry a saved {@link AccessTokenRow.username}, touching Token first (before
   *  ever touching Username) would otherwise blank a saved username out of the draft the identical way
   *  it used to blank Name. @complexity O(1). */
  function setExistingField(rowId: string, patch: Partial<DraftFields>): void {
    setExistingDrafts((prev) => {
      const existing = prev[rowId];
      if (existing) return { ...prev, [rowId]: { ...existing, ...patch } };
      const persistedRow = rows?.find((r) => r.id === rowId);
      return { ...prev, [rowId]: { ...blankDraft(), name: persistedRow?.name ?? "", username: persistedRow?.username ?? "", ...patch } };
    });
  }

  /** {@link replaceToken}'s `kind: "custom"` branch — a custom row has no `AccessTokenFormFields`
   *  shape to build (no `ref`-keyed catalog lookup, no `accountId`), so it reuses only what genuinely
   *  applies: {@link customCredentialReplaceReadyToSave}'s readiness rule (rename-alone, username-alone,
   *  or either together is ready, same as a new token — see that function's own doc for why this is
   *  NOT {@link accessTokenReplaceReadyToSave}) and {@link customCredentialNameTaken}'s workspace-wide
   *  duplicate check (see that function's own doc for why it is NOT {@link accessTokenNameTaken}).
   *  Split out purely to keep {@link replaceToken} itself under this repo's complexity gate. */
  async function replaceCustomCredential(row: AccessTokenRow): Promise<void> {
    const draft = existingDrafts[row.id] ?? { ...blankDraft(), name: row.name, username: row.username ?? "" };
    const fields: AccessTokenFormFields = { ref: { kind: "custom", providerId: row.providerId }, ...draft };
    if (!customCredentialReplaceReadyToSave(fields, row.name, row.username)) return;
    if (customCredentialNameTaken(rows ?? [], fields.name, row.id)) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenDuplicateNameMessage(locale, fields.name.trim(), t("this workspace")) } }));
      return;
    }
    setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: true, error: null } }));
    const nameChanged = fields.name.trim() !== row.name.trim();
    const hasToken = fields.token.trim() !== "";
    try {
      const result = await port.custom.update(row.id, buildCustomCredentialUpdatePatch(fields, nameChanged, hasToken, row.username));
      setCustomCredentials((prev) => mergeRaw(prev ?? [], result, false));
      // Reset to `result.username`, not `fields.username` or blank — `result` is the server's own
      // post-write state, so it is correct whether the operator typed a new username, left it blank
      // to PRESERVE the one already saved (`buildCustomProviderConnectionInput` omits a blank
      // username from the payload rather than sending `""` — see this file's own header), or this
      // save carried no `connection` at all (a rename-only patch). Seeding from `fields.username`
      // instead would show a stale value whenever the omit-to-preserve path fired; seeding blank
      // would resurrect the exact "saved username reads as empty" bug this file exists to fix.
      setExistingDrafts((prev) => ({ ...prev, [row.id]: { ...blankDraft(), name: fields.name.trim(), username: result.username ?? "" } }));
      setExistingBusy((prev) => ({ ...prev, [row.id]: IDLE }));
    } catch (err) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenSubmitErrorMessage(err, t, locale, t("this workspace"), fields.name) } }));
    }
  }

  async function replaceToken(row: AccessTokenRow): Promise<void> {
    if (row.kind === "custom") return replaceCustomCredential(row);
    const ref: AccessTokenProviderRef = { kind: row.kind, providerId: row.providerId };
    // `row.username` is always undefined here (it is only ever set for `kind: "custom"` rows — see
    // AccessTokenRow.username's own doc), so this is a no-op today. Kept for symmetry with
    // replaceCustomCredential's identical fallback, so a future publish/source-control provider that
    // grows a saved username inherits the correct prefill automatically instead of silently reading
    // blank the same way custom rows used to.
    const draft = existingDrafts[row.id] ?? { ...blankDraft(), name: row.name, username: row.username ?? "" };
    const fields: AccessTokenFormFields = { ref, ...draft };
    if (!accessTokenReplaceReadyToSave(fields, row.name)) return;
    const providerLabel = accessTokenProviderInfo(ref).label;
    if (accessTokenNameTaken(rows ?? [], ref, fields.name, row.id)) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenDuplicateNameMessage(locale, fields.name.trim(), providerLabel) } }));
      return;
    }
    setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: true, error: null } }));
    const nameChanged = fields.name.trim() !== row.name.trim();
    const hasToken = fields.token.trim() !== "";
    try {
      const patch = buildAccessTokenUpdatePatch(fields, nameChanged, hasToken);
      const result = await writeCredential(port, row.kind, { type: "update", id: row.id }, patch);
      mergeCredential(row.kind, result, false);
      // Same symmetry note as this function's draft fallback above: `result` (a publish/source-control
      // summary) never carries a `username` fact, so `row.username ?? ""` — not `result.username` —
      // is the only value available, and it is always "" today for these two kinds.
      setExistingDrafts((prev) => ({ ...prev, [row.id]: { ...blankDraft(), name: fields.name.trim(), username: row.username ?? "" } }));
      setExistingBusy((prev) => ({ ...prev, [row.id]: IDLE }));
    } catch (err) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenSubmitErrorMessage(err, t, locale, providerLabel, fields.name) } }));
    }
  }

  /** Removes a saved row, now with real error handling (Terra audit MEDIUM finding, 2026-08-19):
   *  this used to await the API call with no `try`/`catch`, per-row busy/error state, or caught
   *  rejection at all — a normal failure (auth, network, server error) produced an unhandled
   *  rejection and left the operator staring at a row that looked untouched, with no way to tell
   *  the remove had not applied. A rejection now lands in {@link existingBusy}, the SAME per-row
   *  state {@link replaceToken} already renders through `state.error` — no new UI surface needed.
   *  @complexity O(1) plus one network round trip. */
  async function removeToken(row: AccessTokenRow): Promise<void> {
    setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: true, error: null } }));
    try {
      if (row.kind === "custom") {
        await port.custom.remove(row.id);
        setCustomCredentials((await port.custom.list()).credentials);
      } else {
        if (row.kind === "publish") await port.publish.remove(row.id);
        else await port.sourceControl.remove(row.id);
        await refetchStore(row.kind);
      }
      setExistingBusy((prev) => ({ ...prev, [row.id]: IDLE }));
    } catch (err) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenActionErrorMessage(err, t, locale, accessTokenRemoveErrorMessage) } }));
    }
  }

  /** Same error-handling fix as {@link removeToken}'s own doc, for the "Make default" action. */
  async function makeDefault(row: AccessTokenRow): Promise<void> {
    if (row.isDefault) return;
    setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: true, error: null } }));
    try {
      await writeCredential(port, row.kind, { type: "update", id: row.id }, { isDefault: true });
      await refetchStore(row.kind);
      setExistingBusy((prev) => ({ ...prev, [row.id]: IDLE }));
    } catch (err) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenActionErrorMessage(err, t, locale, accessTokenMakeDefaultErrorMessage) } }));
    }
  }

  function openAddForm(ref: AccessTokenProviderRef): void {
    const key = addFormKey(ref);
    setAddForms((prev) => ({ ...prev, [key]: { ...(prev[key] ?? blankAddFormEntry()), visible: true } }));
  }
  function closeAddForm(ref: AccessTokenProviderRef): void {
    setAddForms((prev) => ({ ...prev, [addFormKey(ref)]: blankAddFormEntry() }));
  }
  function setAddField(ref: AccessTokenProviderRef, patch: Partial<DraftFields>): void {
    const key = addFormKey(ref);
    setAddForms((prev) => ({ ...prev, [key]: { ...(prev[key] ?? blankAddFormEntry()), draft: { ...(prev[key]?.draft ?? blankDraft()), ...patch } } }));
  }

  async function createToken(ref: AccessTokenProviderRef): Promise<void> {
    const key = addFormKey(ref);
    const entry = addForms[key] ?? blankAddFormEntry();
    const fields: AccessTokenFormFields = { ref, ...entry.draft };
    if (!accessTokenRowReadyToSave(fields)) return;
    const providerLabel = accessTokenProviderInfo(ref).label;
    if (accessTokenNameTaken(rows ?? [], ref, fields.name)) {
      setAddForms((prev) => ({ ...prev, [key]: { ...entry, error: accessTokenDuplicateNameMessage(locale, fields.name.trim(), providerLabel) } }));
      return;
    }
    setAddForms((prev) => ({ ...prev, [key]: { ...entry, saving: true, error: null } }));
    try {
      const connection = buildAccessTokenConnectionInput(fields);
      const result = await writeCredential(port, ref.kind, { type: "create", label: fields.name.trim() }, { connection });
      mergeCredential(ref.kind, result, true);
      setAddForms((prev) => ({ ...prev, [key]: blankAddFormEntry() }));
    } catch (err) {
      setAddForms((prev) => ({
        ...prev,
        [key]: { ...entry, saving: false, error: accessTokenSubmitErrorMessage(err, t, locale, providerLabel, fields.name) },
      }));
    }
  }

  /** One singleton group per saved custom row — no shared catalog entry to group under (this file's
   *  own header), so each row IS its own group. `addForm` is always the inert blank state: creation
   *  happens through the standalone dialog (`customAddForm` below), never through a per-group
   *  `[+ Add another]` affordance — `AccessTokensTab.tsx`'s `ProviderGroup` skips rendering that
   *  affordance for `kind: "custom"` groups for the identical reason. */
  const customGroups = useMemo<readonly AccessTokenProviderGroupState[]>(() => {
    if (rows === undefined) return [];
    return rows
      .filter((row) => row.kind === "custom" && accessTokenCategoryMatches(row.category ?? "general", category) && accessTokenRowMatchesQuery(row, accessTokenRowProviderInfo(row), query))
      .map((row) => ({
        info: accessTokenRowProviderInfo(row),
        rows: [existingRowState(row, existingDrafts[row.id], existingBusy[row.id])],
        addForm: addFormState(undefined),
      }));
  }, [rows, existingDrafts, existingBusy, query, category]);

  const groups = useMemo<readonly AccessTokenProviderGroupState[] | undefined>(() => {
    if (rows === undefined) return undefined;
    // A provider outside the active category is dropped here, before the query filter ever runs —
    // see this file's header for why that keeps `totalCount`/`matchCount` a global fact instead.
    const catalogGroups = ACCESS_TOKEN_PROVIDERS.filter((info) => accessTokenCategoryMatches(info.category, category)).map((info) => {
      const providerRows = accessTokenRowsForProvider(rows, info).filter((row) => accessTokenRowMatchesQuery(row, info, query));
      return {
        info,
        rows: providerRows.map((row) => existingRowState(row, existingDrafts[row.id], existingBusy[row.id])),
        addForm: addFormState(addForms[addFormKey(info)]),
      };
    });
    return [...catalogGroups, ...customGroups];
  }, [rows, existingDrafts, existingBusy, addForms, query, category, customGroups]);

  const totalCount = rows?.length ?? 0;
  const matchCount = rows === undefined ? 0 : rows.filter((row) => accessTokenRowMatchesQuery(row, accessTokenRowProviderInfo(row), query)).length;

  function setCustomAddField(patch: Partial<CustomDraftFields>): void {
    setCustomAddDraft((prev) => ({ ...prev, ...patch }));
  }

  function resetCustomAddForm(): void {
    setCustomAddDraft(blankCustomDraft());
    setCustomAddBusy(IDLE);
  }

  /** Returns whether the save succeeded — `AccessTokensTab.tsx`'s dialog uses this to decide whether
   *  to close itself (native `<dialog>` close is a DOM action this hook does not own, same split
   *  {@link RemoveConfirmDialog} already draws). */
  async function createCustomCredential(): Promise<boolean> {
    const fields: CustomCredentialFormFields = customAddDraft;
    if (!customCredentialReadyToSave(fields)) return false;
    if (customCredentialNameTaken(rows ?? [], fields.name)) {
      setCustomAddBusy({ saving: false, error: accessTokenDuplicateNameMessage(locale, fields.name.trim(), t("this workspace")) });
      return false;
    }
    setCustomAddBusy({ saving: true, error: null });
    try {
      const result = await port.custom.create({
        label: fields.name.trim(),
        category: fields.category,
        baseUrl: fields.baseUrl.trim(),
        additionalHosts: buildAdditionalHostsInput(fields.additionalHosts),
        connection: buildCustomProviderConnectionInput(fields),
      });
      setCustomCredentials((prev) => mergeRaw(prev ?? [], result, true));
      resetCustomAddForm();
      return true;
    } catch (err) {
      setCustomAddBusy({ saving: false, error: accessTokenSubmitErrorMessage(err, t, locale, t("this workspace"), fields.name) });
      return false;
    }
  }

  return {
    groups,
    loadError,
    query,
    setQuery,
    category,
    setCategory,
    totalCount,
    matchCount,
    setExistingField,
    replaceToken,
    removeToken,
    makeDefault,
    openAddForm,
    closeAddForm,
    setAddField,
    createToken,
    customAddForm: { ...customAddDraft, saving: customAddBusy.saving, error: customAddBusy.error },
    setCustomAddField,
    resetCustomAddForm,
    createCustomCredential,
    t,
  };
}

/** @complexity O(n) in the provider's own (small) saved-row count. */
function mergeRaw<T extends { id: string }>(list: readonly T[], result: T, isNew: boolean): T[] {
  return isNew ? [...list, result] : list.map((item) => (item.id === result.id ? result : item));
}

/**
 * Binds the real port, and a `t` bound to the real resolved locale — the zero-argument half of the
 * `useX(dependencies)` / `useWiredX()` pair, same shape `useWiredPublishCredentials`/
 * `useWiredSourceControlCredentials` document.
 *
 * `boundT` is a `useCallback` (matching `useWiredSites`'s identical `const t = useCallback(...)`),
 * not a plain arrow function recreated every render (2026-09-05 Gemini audit, CONFIRMED): `t` flows
 * into `reloadAllStores`'s own `useCallback` dependency array above, which is correct — `t` is a
 * genuine dependency there (`accessTokensLoadErrorMessage`/`describeApiError` both call it) — but a
 * dependency that changes identity every render still defeats the surrounding `useCallback` just the
 * same. That in turn gave `triggerReload` a new identity every render, and `triggerReload` is exactly
 * what `useContentRefreshSubscription`'s own header warns changes identity every render (see this
 * hook's own `triggerReload` comment): its effect deps are `[resource, onRefresh]`, so an unstable
 * `onRefresh` tore down and rebuilt the SSE subscription on every single render for no benefit. Only
 * `locale` changing should ever produce a new `boundT`.
 */
export function useWiredAccessTokens(): AccessTokensController {
  const locale = useAdminLocale();
  const boundT = useCallback((key: string): string => defaultT(locale, key), [locale]);
  return useAccessTokens(defaultAccessTokensPort, boundT, locale);
}
