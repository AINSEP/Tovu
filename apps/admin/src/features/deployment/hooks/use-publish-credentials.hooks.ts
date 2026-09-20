import { useEffect, useRef, useState } from "react";

import {
  describeApiError,
  type AdminPublishCredentialProviderId,
  type AdminPublishCredentialSummary,
  type AdminPublishCredentialVerification,
  type AdminPublishExecutionMode,
} from "@/lib/api";
import { useFetchQuery } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import {
  t as defaultT,
  publishCredentialSaveErrorMessage,
  publishCredentialsLoadErrorMessage,
  publishCredentialSelectErrorMessage,
  publishCredentialVerifyErrorMessage,
} from "../deployment-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import {
  PUBLISH_CREDENTIAL_PROVIDERS,
  PUBLISH_CREDENTIAL_ROW_LABEL,
  buildPublishConnectionInput,
  classifyPublishCredentialSubmitError,
  credentialsForProvider,
  defaultCredentialForProvider,
  publishCredentialRowReadyToSave,
  withPromotedDefault,
  type PublishCredentialFormFields,
} from "../rules";
import { defaultPublishCredentialsPort } from "./publish-credentials-dependencies.hooks";
import type { PublishCredentialsPort } from "./publish-credentials-port.hooks";

/**
 * @file The Static Site tab's credential-management section — one always-visible row per provider,
 * each with its own token input, save action, and connected/not-connected status. See
 * `StaticSiteTab.tsx`'s `PublishCredentialsSection` header for the UI half of this story.
 *
 * ## 2026-08-15 redesign — a settings form, not a collection to manage
 *
 * This hook used to model credentials the way a CRUD screen models any collection: a list, an
 * "Add credential" button, a provider `<select>`, a user-invented `label`, and per-row
 * edit/delete/make-default actions. The owner's own read: "'Add credential' should be gone. Just
 * list the providers, labels, and access token space, and that's it" — the whole point of an
 * "Add" flow is asking the operator to create and name an object before they can type a token, and
 * there is nothing here to name: {@link PUBLISH_CREDENTIAL_PROVIDERS} already names the fixed set of
 * four things a token can be saved for. So this hook now exposes {@link PublishCredentialRowState}
 * per provider instead of a form's worth of shared state — no `providerId`/`label` picker, no
 * isFormOpen/editingId mode split, no delete or default-promotion affordance (the data model still
 * supports more than one saved connection per provider and un-defaulting one via delete — see
 * `rules.ts`'s `PUBLISH_CREDENTIAL_ROW_LABEL` doc — this UI just never exposes that).
 *
 * ## A stored credential is NEVER read back — this is why every row's inputs start blank
 *
 * `AdminPublishCredentialSummary` carries no token, no ciphertext, and deliberately no masked suffix
 * (see that type's own doc in `lib/api.ts`). So a row's `token`/`accountId` draft state can only ever
 * start blank, connected or not — a blank `token` at save time is therefore not "the operator left it
 * empty by mistake"; on an already-connected row it is the ONLY way to express "nothing to change
 * here" (`publishCredentialRowReadyToSave`, `rules.ts`, disables Save in that case rather than
 * sending a no-op write).
 *
 * ## Save decides CREATE vs. UPDATE by looking at what is already there, not at UI mode
 *
 * {@link save} reads the provider's current DEFAULT connection via `rules.ts`'s
 * `defaultCredentialForProvider` (the exact row a real publish would use). If one exists, save PUTs
 * to its id, replacing the connection but leaving its own label untouched. If none exists, save
 * POSTs a brand-new one labeled {@link PUBLISH_CREDENTIAL_ROW_LABEL} — the one fixed label this whole
 * flat-list UI ever writes, which satisfies the server's still-live `(workspace_id, provider_id,
 * label)` UNIQUE constraint without ever asking an operator to type one. Neither branch sends
 * `isDefault`: a brand-new connection auto-defaults server-side as a provider's first-ever saved
 * connection (`publish-credentials/store.ts`'s `decideCreateDefault`), and replacing an existing
 * default's connection never changes which row is default.
 *
 * ## `verify` — the "hit verify on the token" button the assistant's own guidance already assumed existed
 *
 * 2026-08-16 (see `ADS-memory/reports/verification/2026-08-16-live-publish-through-assistant.md`):
 * the assistant's own capability tool told a human to "go verify the GitHub token" through this admin
 * whenever the in-process verification cache went cold (e.g. right after a restart), but no control
 * ever called `POST .../credentials/:id/verify` — the backend route worked, nothing in this hook or
 * `StaticSiteTab.tsx` reached it. {@link verify} closes that gap: same optimistic-local-update
 * philosophy as {@link save} above (no unconditional refetch), but it can only ever update a row that
 * is ALREADY connected — there is no credential id to verify before one exists.
 *
 * ## The row list is optimistically maintained locally, not refetched after every write
 *
 * `save` splices its own result into the local `credentials` array rather than re-running
 * `listCredentials()` — one round trip per write instead of two, matching the CRUD hook this
 * replaces. Draft `token`/`accountId` are cleared back to blank on a successful save (there is
 * nothing left to keep typed — the row now reads its "Connected" status from the fresh summary).
 */
export interface PublishCredentialRowState {
  readonly providerId: AdminPublishCredentialProviderId;
  /** This provider's saved DEFAULT connection, if any (`rules.ts`'s `defaultCredentialForProvider`)
   *  — `undefined` means "not connected yet". Never carries a token or `accountId`; see this file's
   *  header for why every row's connection fields always start blank regardless of this value. */
  readonly saved: AdminPublishCredentialSummary | undefined;
  readonly token: string;
  readonly accountId: string;
  readonly saving: boolean;
  readonly error: string | null;
  /** True while {@link PublishCredentialsController.verify} has an in-flight request for THIS
   *  provider's saved row. A no-op button click while already `true` is guarded the same way
   *  `save`'s own `row.saving` disables its button — see `CredentialStepDone`'s Verify button. */
  readonly verifying: boolean;
  /** The most recent explicit re-verify's result for this row, `undefined` until {@link verify} has
   *  resolved at least once this session — deliberately session-only, never seeded from the initial
   *  load: the server has no "last verification" to hand back on `GET`, only the durable
   *  `saved.accountLabel` half of it (see that field's own doc). Distinct from `error` below: a
   *  `"invalid"`/`"unreachable"` `status` here is the provider's own answer, not a failure of this
   *  UI's request — {@link error} is reserved for a genuine transport/request failure instead. */
  readonly verification: AdminPublishCredentialVerification | undefined;
  /** A transport/request failure from {@link verify} itself (network down, 5xx) — NOT a
   *  `"invalid"`/`"unreachable"` provider answer, which is a normal {@link verification} result, not
   *  an error. See this file's `publishCredentialVerifyErrorMessage` import for the translated text. */
  readonly verifyError: string | null;
  /** The credential id the picker is promoting to this provider's default right now, `null` when no
   *  promotion is in flight. The picker shows this id (not {@link saved}'s) while it is set, so the
   *  choice doesn't appear to snap back before the server has answered. */
  readonly selectingCredentialId: string | null;
  /** Why the last promotion for this provider failed, `null` otherwise. Cleared by the next pick. */
  readonly selectError: string | null;
}

export interface PublishCredentialsController {
  /** One entry per {@link PUBLISH_CREDENTIAL_PROVIDERS} provider, in that fixed order —
   *  `undefined` until the first load resolves, same "no data yet" convention every other hook in
   *  this panel uses (`StaticExportController.run`, `StaticPublishController.run`). */
  rows: readonly PublishCredentialRowState[] | undefined;
  /** The server's own execution capability for this instance — `undefined` until the same first
   *  load resolves. Never derived any other way; see `AdminPublishExecutionMode`'s doc. */
  executionMode: AdminPublishExecutionMode | undefined;
  loadError: string | null;
  /** True while ANY write that changes which token a publish uses is in flight — a default-promotion
   *  ({@link selectCredential}) or a connection replacement ({@link save}). The server picks a
   *  publish's credential as whichever row is default when the publish request lands
   *  (`static-publish/adapter.ts`'s `resolvePublishCredentialForSite`; the request carries no
   *  credential id), so a Publish sent inside this window would go out on the OLD token. The Static
   *  Site tab's Publish button is disabled on this. (terra review 2026-09-20, finding 1.) */
  credentialChangePending: boolean;

  setToken: (providerId: AdminPublishCredentialProviderId, value: string) => void;
  setAccountId: (providerId: AdminPublishCredentialProviderId, value: string) => void;
  /** Creates or replaces one provider's saved connection from its own row's current `token`/
   *  `accountId` — see this file's header for the create-vs-update decision. A no-op if
   *  {@link publishCredentialRowReadyToSave} says this row is not ready (the same guard the row's
   *  own Save button is disabled on, kept here too so a direct call — as this file's own tests make —
   *  cannot bypass it). Resolves either way — a failure is surfaced through that row's own `error`. */
  save: (providerId: AdminPublishCredentialProviderId) => Promise<void>;
  /** Every saved connection for one provider, not just its default — `rows` above only ever carries
   *  {@link defaultCredentialForProvider}'s pick, which is enough for the always-visible credential
   *  row but not for the picker `StaticSiteTab.tsx`'s "which saved token publishes" dropdown needs
   *  once a provider has more than one (the owner's own original ask: "GitHub pages... will have a
   *  dropdown where you can choose which GitHub access tokens"). Added rather than widening `rows`
   *  itself so every existing caller of `rows` keeps reading exactly the one row it always has. */
  credentialsForProvider: (providerId: AdminPublishCredentialProviderId) => readonly AdminPublishCredentialSummary[];
  /** Promotes one already-saved connection to this provider's default — the same `isDefault`
   *  mechanic the Security page's own "Make default" already writes through
   *  (`use-access-tokens.hooks.ts`'s `makeDefault`), reused here rather than reinvented. Never
   *  splices optimistically: promoting one row un-defaults whichever OTHER row held it server-side,
   *  so the local list changes only once the write has resolved (`rules.ts`'s `withPromotedDefault`),
   *  then re-fetches to reconcile. A failed re-fetch keeps that confirmed local promotion rather than
   *  leaving the old default on screen after the server has already switched.
   *
   *  A no-op if `credentialId` is already this provider's default, or while a promotion for this
   *  provider is still in flight. Never rejects — a failure lands in that row's
   *  {@link PublishCredentialRowState.selectError}. */
  selectCredential: (providerId: AdminPublishCredentialProviderId, credentialId: string) => Promise<void>;
  /** Re-checks the provider's currently connected (default) row against its real provider right now
   *  — the UI half of `POST .../credentials/:id/verify` (`publish-credentials.ts`'s route doc), for
   *  when the automatic verify-on-save result is stale (a rotated token) or was lost (an in-memory
   *  cache that a server restart clears — see `AdminPublishCredentialSummary.accountLabel`'s doc for
   *  why `saved.accountLabel` survives that even though a single verify RESPONSE does not). A no-op,
   *  resolving immediately, if this provider has no saved (connected) row yet — there is nothing to
   *  verify. Never throws; a failure is surfaced through that row's own {@link
   *  PublishCredentialRowState.verifyError}. */
  verify: (providerId: AdminPublishCredentialProviderId) => Promise<void>;

  t: Translate;
}

/** One row's draft input + busy/error state — kept in a map keyed by provider id so each row's own
 *  typing and in-flight save/verify are fully independent of every other row's. */
interface RowFormState {
  token: string;
  accountId: string;
  saving: boolean;
  error: string | null;
  verifying: boolean;
  verification: AdminPublishCredentialVerification | undefined;
  verifyError: string | null;
}

/** One provider's token-picker promotion — see {@link PublishCredentialRowState.selectingCredentialId}
 *  and {@link PublishCredentialRowState.selectError}. */
interface SelectionState {
  pendingId: string | null;
  error: string | null;
}

function blankRowFormState(): RowFormState {
  return { token: "", accountId: "", saving: false, error: null, verifying: false, verification: undefined, verifyError: null };
}

function initialRowFormStates(): Record<AdminPublishCredentialProviderId, RowFormState> {
  const entries = PUBLISH_CREDENTIAL_PROVIDERS.map((provider) => [provider.id, blankRowFormState()] as const);
  return Object.fromEntries(entries) as Record<AdminPublishCredentialProviderId, RowFormState>;
}

/** Translates a rejected create/update into the exact string {@link usePublishCredentials}'s `save`
 *  stores as that row's `error` — pulled out of `save` for the same complexity-budget reason
 *  `StaticSiteTab.tsx`'s per-provider field split documents one file over. Layers
 *  `classifyPublishCredentialSubmitError`'s (`rules.ts`) specific cases over the shared
 *  `describeApiError` base case, same "check specific codes first, fall through to the shared base"
 *  convention `lib/api.ts`'s own `describeApiError` doc recommends every screen follow. The
 *  duplicate-label case reads oddly translated verbatim from the server ("a credential labeled...")
 *  since this UI no longer shows labels at all, so it gets its own row-shaped sentence instead of the
 *  server's own wording — this case should be unreachable in normal use (save always targets an
 *  existing row's id once one exists) and can only fire on a genuine write race.
 *  @complexity O(1). */
function publishCredentialSubmitErrorMessage(err: unknown, t: Translate, locale: string): string {
  const classified = classifyPublishCredentialSubmitError(err);
  if (classified.kind === "duplicate-label") return t("This connection was already saved — reload the page and try again.");
  if (classified.kind === "validation") return publishCredentialSaveErrorMessage(locale, classified.detail);
  return publishCredentialSaveErrorMessage(locale, describeApiError(err, "unknown error"));
}

export function usePublishCredentials(port: PublishCredentialsPort, t: Translate, locale: string): PublishCredentialsController {
  const query = useFetchQuery({ key: ["deployment", "publish-credentials"], fetch: () => port.listCredentials() });
  const [credentials, setCredentials] = useState<AdminPublishCredentialSummary[] | undefined>(undefined);
  const [executionMode, setExecutionMode] = useState<AdminPublishExecutionMode | undefined>(undefined);

  // Seeds local state from the query's first successful load, exactly once — same shape
  // `use-static-publish.hooks.ts`'s own `seededRef` uses. Later changes flow through `save` below,
  // not through the query re-resolving (see this file's header on why writes are optimistic rather
  // than refetch-driven).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || query.status === "loading" || !query.data) return;
    seededRef.current = true;
    setCredentials(query.data.credentials);
    setExecutionMode(query.data.executionMode);
  }, [query.status, query.data]);

  const loadError = query.error ? publishCredentialsLoadErrorMessage(locale, describeApiError(query.error, "unknown error")) : null;

  const [formStates, setFormStates] = useState<Record<AdminPublishCredentialProviderId, RowFormState>>(initialRowFormStates);
  // The picker's promotion state, kept apart from `formStates`: a `save` that lands mid-promotion
  // resets its row's form state to blank, which must not also clear the in-flight flag Publish waits on.
  const [selections, setSelections] = useState<Partial<Record<AdminPublishCredentialProviderId, SelectionState>>>({});
  // Synchronous duplicate guard for `selectCredential` — a ref, not `selections`, for the same reason
  // `use-static-publish.hooks.ts`'s `publishingRef` documents: two calls in one tick both read the
  // same stale state, and two racing promotions would leave the default to whichever PUT lands last.
  const selectingRef = useRef(new Set<AdminPublishCredentialProviderId>());

  function setToken(providerId: AdminPublishCredentialProviderId, value: string) {
    setFormStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], token: value } }));
  }

  function setAccountId(providerId: AdminPublishCredentialProviderId, value: string) {
    setFormStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], accountId: value } }));
  }

  async function save(providerId: AdminPublishCredentialProviderId) {
    const formState = formStates[providerId];
    const fields: PublishCredentialFormFields = { providerId, token: formState.token, accountId: formState.accountId };
    if (!publishCredentialRowReadyToSave(fields)) return;

    const existing = defaultCredentialForProvider(credentials ?? [], providerId);
    setFormStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], saving: true, error: null } }));
    try {
      const connection = buildPublishConnectionInput(fields);
      const result = existing
        ? await port.updateCredential(existing.id, { connection })
        : await port.createCredential({ label: PUBLISH_CREDENTIAL_ROW_LABEL, connection });
      setCredentials((prev) => {
        const base = prev ?? [];
        return existing ? base.map((current) => (current.id === result.id ? result : current)) : [...base, result];
      });
      setFormStates((prev) => ({ ...prev, [providerId]: blankRowFormState() }));
    } catch (err) {
      setFormStates((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], saving: false, error: publishCredentialSubmitErrorMessage(err, t, locale) },
      }));
    }
  }

  async function verify(providerId: AdminPublishCredentialProviderId): Promise<void> {
    const connected = defaultCredentialForProvider(credentials ?? [], providerId);
    if (!connected) return; // Nothing saved for this provider yet — no row for `verify`'s button to have come from.

    setFormStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], verifying: true, verifyError: null } }));
    try {
      const result = await port.verifyCredential(connected.id);
      // Mirrors the server's own `healAccountLabel` write (`publish-credentials.ts`'s route doc) —
      // a `"valid"` result carrying an `accountLabel` updates this row's SAVED summary immediately,
      // rather than waiting on a refetch this hook has no other reason to trigger. `undefined` (no
      // account label on this result) leaves whatever the row already had alone, same "only a truthy
      // finding heals forward" rule the server side follows.
      if (result.accountLabel !== undefined) {
        setCredentials((prev) => (prev ?? []).map((c) => (c.id === connected.id ? { ...c, accountLabel: result.accountLabel! } : c)));
      }
      setFormStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], verifying: false, verification: result, verifyError: null } }));
    } catch (err) {
      setFormStates((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], verifying: false, verifyError: publishCredentialVerifyErrorMessage(locale, describeApiError(err, "unknown error")) },
      }));
    }
  }

  const rows: readonly PublishCredentialRowState[] | undefined =
    credentials === undefined
      ? undefined
      : PUBLISH_CREDENTIAL_PROVIDERS.map((provider) => {
          const formState = formStates[provider.id];
          return {
            providerId: provider.id,
            saved: defaultCredentialForProvider(credentials, provider.id),
            token: formState.token,
            accountId: formState.accountId,
            saving: formState.saving,
            error: formState.error,
            verifying: formState.verifying,
            verification: formState.verification,
            verifyError: formState.verifyError,
            selectingCredentialId: selections[provider.id]?.pendingId ?? null,
            selectError: selections[provider.id]?.error ?? null,
          };
        });

  const credentialChangePending = PUBLISH_CREDENTIAL_PROVIDERS.some(
    (provider) => formStates[provider.id].saving || (selections[provider.id]?.pendingId ?? null) !== null
  );

  function credentialsForProviderId(providerId: AdminPublishCredentialProviderId): readonly AdminPublishCredentialSummary[] {
    return credentialsForProvider(credentials ?? [], providerId);
  }

  async function selectCredential(providerId: AdminPublishCredentialProviderId, credentialId: string): Promise<void> {
    const current = defaultCredentialForProvider(credentials ?? [], providerId);
    if (current?.id === credentialId || selectingRef.current.has(providerId)) return;
    selectingRef.current.add(providerId);
    setSelections((prev) => ({ ...prev, [providerId]: { pendingId: credentialId, error: null } }));
    let error: string | null = null;
    try {
      const promoted = await port.updateCredential(credentialId, { isDefault: true });
      setCredentials((prev) => withPromotedDefault(prev ?? [], promoted));
      await reconcileCredentials();
    } catch (err) {
      error = publishCredentialSelectErrorMessage(locale, describeApiError(err, "unknown error"));
    } finally {
      selectingRef.current.delete(providerId);
      setSelections((prev) => ({ ...prev, [providerId]: { pendingId: null, error } }));
    }
  }

  /** Best-effort re-read after a promotion the server already confirmed. A failure is deliberately
   *  swallowed: the local list was already updated from the server's own response, so it is correct —
   *  surfacing an error here would tell the operator the switch failed when it did not. */
  async function reconcileCredentials(): Promise<void> {
    try {
      const refreshed = await port.listCredentials();
      setCredentials(refreshed.credentials);
    } catch {
      // See this function's doc — the confirmed local promotion stands.
    }
  }

  return {
    rows,
    executionMode,
    loadError,
    credentialChangePending,
    setToken,
    setAccountId,
    save,
    credentialsForProvider: credentialsForProviderId,
    selectCredential,
    verify,
    t,
  };
}

/**
 * Binds the real `/api/.../system/publish/credentials` client, and a `t` bound to the real resolved
 * locale — the zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, same shape
 * `use-static-publish.hooks.ts`'s `useWiredStaticPublish` documents.
 */
export function useWiredPublishCredentials(): PublishCredentialsController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT(locale, key);
  return usePublishCredentials(defaultPublishCredentialsPort, t, locale);
}
