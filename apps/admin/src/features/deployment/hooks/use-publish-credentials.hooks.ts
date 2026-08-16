import { useEffect, useRef, useState } from "react";

import {
  describeApiError,
  type AdminPublishCredentialProviderId,
  type AdminPublishCredentialSummary,
  type AdminPublishExecutionMode,
} from "../../../lib/api";
import { useFetchQuery } from "../../../lib/fetch-query";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as defaultT, publishCredentialSaveErrorMessage, publishCredentialsLoadErrorMessage } from "../deployment-i18n";
import type { Translate } from "../../../lib/dictionary-translator";
import {
  PUBLISH_CREDENTIAL_PROVIDERS,
  PUBLISH_CREDENTIAL_ROW_LABEL,
  buildPublishConnectionInput,
  classifyPublishCredentialSubmitError,
  defaultCredentialForProvider,
  publishCredentialRowReadyToSave,
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

  setToken: (providerId: AdminPublishCredentialProviderId, value: string) => void;
  setAccountId: (providerId: AdminPublishCredentialProviderId, value: string) => void;
  /** Creates or replaces one provider's saved connection from its own row's current `token`/
   *  `accountId` — see this file's header for the create-vs-update decision. A no-op if
   *  {@link publishCredentialRowReadyToSave} says this row is not ready (the same guard the row's
   *  own Save button is disabled on, kept here too so a direct call — as this file's own tests make —
   *  cannot bypass it). Resolves either way — a failure is surfaced through that row's own `error`. */
  save: (providerId: AdminPublishCredentialProviderId) => Promise<void>;

  t: Translate;
}

/** One row's draft input + busy/error state — kept in a map keyed by provider id so each row's own
 *  typing and in-flight save are fully independent of every other row's. */
interface RowFormState {
  token: string;
  accountId: string;
  saving: boolean;
  error: string | null;
}

function blankRowFormState(): RowFormState {
  return { token: "", accountId: "", saving: false, error: null };
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
          };
        });

  return { rows, executionMode, loadError, setToken, setAccountId, save, t };
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
