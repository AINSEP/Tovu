import { useEffect, useMemo, useRef, useState } from "react";

import {
  describeApiError,
  type AdminCustomCredentialCategoryId,
  type AdminCustomCredentialSummary,
  type AdminPublishConnectionInput,
  type AdminPublishCredentialSummary,
  type AdminSourceControlConnectionInput,
  type AdminSourceControlCredentialSummary,
} from "../../../lib/api";
import { useFetchQuery } from "../../../lib/fetch-query";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import type { Translate } from "../../../lib/dictionary-translator";
import {
  t as defaultT,
  accessTokenDuplicateNameMessage,
  accessTokenSaveErrorMessage,
  accessTokensLoadErrorMessage,
} from "../security-i18n";
import {
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
  buildCustomCredentialRows,
  buildCustomProviderConnectionInput,
  classifyAccessTokenSubmitError,
  customCredentialNameTaken,
  customCredentialReadyToSave,
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
  readonly token: string;
  readonly username: string;
}
function blankCustomDraft(): CustomDraftFields {
  return { name: "", category: "general", baseUrl: "", token: "", username: "" };
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
 *  name (Replace's "current Name pre-filled" behavior) and every other field blank, same "never read
 *  a secret back" posture every credential form in this app already has.
 *  @complexity O(1). */
function existingRowState(row: AccessTokenRow, draft: DraftFields | undefined, busy: BusyState | undefined): AccessTokenExistingRowState {
  const d = draft ?? { ...blankDraft(), name: row.name };
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

  const loadError =
    (publishQuery.error && accessTokensLoadErrorMessage(locale, describeApiError(publishQuery.error, t("unknown error")))) ||
    (sourceControlQuery.error && accessTokensLoadErrorMessage(locale, describeApiError(sourceControlQuery.error, t("unknown error")))) ||
    (customQuery.error && accessTokensLoadErrorMessage(locale, describeApiError(customQuery.error, t("unknown error")))) ||
    null;

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

  function setExistingField(rowId: string, patch: Partial<DraftFields>): void {
    setExistingDrafts((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] ?? blankDraft()), ...patch } }));
  }

  /** {@link replaceToken}'s `kind: "custom"` branch — a custom row has no `AccessTokenFormFields`
   *  shape to build (no `ref`-keyed catalog lookup, no `accountId`), so it reuses only what genuinely
   *  applies: {@link accessTokenReplaceReadyToSave}'s readiness rule (rename-alone-is-ready, or a new
   *  token) and {@link customCredentialNameTaken}'s workspace-wide duplicate check (see that
   *  function's own doc for why it is NOT {@link accessTokenNameTaken}). Split out purely to keep
   *  {@link replaceToken} itself under this repo's complexity gate. */
  async function replaceCustomCredential(row: AccessTokenRow): Promise<void> {
    const draft = existingDrafts[row.id] ?? { ...blankDraft(), name: row.name };
    const fields: AccessTokenFormFields = { ref: { kind: "custom", providerId: row.providerId }, ...draft };
    if (!accessTokenReplaceReadyToSave(fields, row.name)) return;
    if (customCredentialNameTaken(rows ?? [], fields.name, row.id)) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenDuplicateNameMessage(locale, fields.name.trim(), t("this workspace")) } }));
      return;
    }
    setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: true, error: null } }));
    const nameChanged = fields.name.trim() !== row.name.trim();
    const hasToken = fields.token.trim() !== "";
    try {
      const result = await port.custom.update(row.id, {
        ...(nameChanged ? { label: fields.name.trim() } : {}),
        ...(hasToken ? { connection: buildCustomProviderConnectionInput(fields) } : {}),
      });
      setCustomCredentials((prev) => mergeRaw(prev ?? [], result, false));
      setExistingDrafts((prev) => ({ ...prev, [row.id]: { ...blankDraft(), name: fields.name.trim() } }));
      setExistingBusy((prev) => ({ ...prev, [row.id]: IDLE }));
    } catch (err) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenSubmitErrorMessage(err, t, locale, t("this workspace"), fields.name) } }));
    }
  }

  async function replaceToken(row: AccessTokenRow): Promise<void> {
    if (row.kind === "custom") return replaceCustomCredential(row);
    const ref: AccessTokenProviderRef = { kind: row.kind, providerId: row.providerId };
    const draft = existingDrafts[row.id] ?? { ...blankDraft(), name: row.name };
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
      setExistingDrafts((prev) => ({ ...prev, [row.id]: { ...blankDraft(), name: fields.name.trim() } }));
      setExistingBusy((prev) => ({ ...prev, [row.id]: IDLE }));
    } catch (err) {
      setExistingBusy((prev) => ({ ...prev, [row.id]: { saving: false, error: accessTokenSubmitErrorMessage(err, t, locale, providerLabel, fields.name) } }));
    }
  }

  async function removeToken(row: AccessTokenRow): Promise<void> {
    if (row.kind === "custom") {
      await port.custom.remove(row.id);
      setCustomCredentials((await port.custom.list()).credentials);
      return;
    }
    if (row.kind === "publish") await port.publish.remove(row.id);
    else await port.sourceControl.remove(row.id);
    await refetchStore(row.kind);
  }

  async function makeDefault(row: AccessTokenRow): Promise<void> {
    if (row.isDefault) return;
    await writeCredential(port, row.kind, { type: "update", id: row.id }, { isDefault: true });
    await refetchStore(row.kind);
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
 */
export function useWiredAccessTokens(): AccessTokensController {
  const locale = useAdminLocale();
  const boundT = (key: string): string => defaultT(locale, key);
  return useAccessTokens(defaultAccessTokensPort, boundT, locale);
}
