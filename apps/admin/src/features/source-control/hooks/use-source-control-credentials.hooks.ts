import { useEffect, useRef, useState } from "react";

import { describeApiError, type AdminSourceControlCredentialSummary, type AdminSourceControlProviderId } from "@/lib/api";
import { useFetchQuery } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as defaultT, sourceControlCredentialSaveErrorMessage, sourceControlCredentialsLoadErrorMessage } from "../source-control-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import {
  SOURCE_CONTROL_CREDENTIAL_ROW_LABEL,
  SOURCE_CONTROL_PROVIDERS,
  buildSourceControlConnectionInput,
  classifySourceControlCredentialSubmitError,
  defaultSourceControlCredentialForProvider,
  sourceControlCredentialRowReadyToSave,
  type SourceControlCredentialFormFields,
} from "../rules";
import { defaultSourceControlCredentialsPort } from "./source-control-credentials-dependencies.hooks";
import type { SourceControlCredentialsPort } from "./source-control-credentials-port.hooks";

/**
 * @file The Source Control page's credential-management hook — one always-visible row per provider,
 * each with its own token (plus Bitbucket's username) input, save action, and connected/not
 * status. Mirrors `deployment/hooks/use-publish-credentials.hooks.ts` closely — same flat-row shape,
 * same optimistic local-state-after-write pattern, same create-vs-update-by-looking-at-what-exists
 * decision — with two differences: no `executionMode` (this page has no CLI-first alternative path
 * to branch on, unlike static publish), and `username` in place of `accountId` as the one provider
 * (Bitbucket, not Cloudflare Pages) that needs a field beyond the universal token.
 *
 * ## A stored credential is NEVER read back — this is why every row's inputs start blank
 *
 * `AdminSourceControlCredentialSummary` carries no token, no ciphertext, and no masked suffix. So a
 * row's `token`/`username` draft state can only ever start blank, connected or not — a blank token
 * at save time therefore means "nothing to change" on an already-connected row, not "the operator
 * left it empty by mistake" (`sourceControlCredentialRowReadyToSave`, `rules.ts`, disables Save in
 * that case rather than sending a no-op write).
 *
 * ## Save decides CREATE vs. UPDATE by looking at what is already there, not at UI mode
 *
 * {@link save} reads the provider's current DEFAULT connection via `rules.ts`'s
 * `defaultSourceControlCredentialForProvider`. If one exists, save PUTs to its id, replacing the
 * connection but leaving its own label untouched. If none exists, save POSTs a brand-new one
 * labeled {@link SOURCE_CONTROL_CREDENTIAL_ROW_LABEL} — the one fixed label this flat-list UI ever
 * writes.
 *
 * ## The row list is optimistically maintained locally, not refetched after every write
 *
 * `save` splices its own result into the local `credentials` array rather than re-running
 * `listCredentials()` — one round trip per write. Draft `token`/`username` are cleared back to
 * blank on a successful save.
 */
export interface SourceControlCredentialRowState {
  readonly providerId: AdminSourceControlProviderId;
  /** This provider's saved DEFAULT connection, if any — `undefined` means "not connected yet". */
  readonly saved: AdminSourceControlCredentialSummary | undefined;
  readonly token: string;
  readonly username: string;
  readonly saving: boolean;
  readonly error: string | null;
}

export interface SourceControlCredentialsController {
  /** One entry per {@link SOURCE_CONTROL_PROVIDERS} provider, in that fixed order — `undefined`
   *  until the first load resolves. */
  rows: readonly SourceControlCredentialRowState[] | undefined;
  loadError: string | null;

  setToken: (providerId: AdminSourceControlProviderId, value: string) => void;
  setUsername: (providerId: AdminSourceControlProviderId, value: string) => void;
  /** Creates or replaces one provider's saved connection from its own row's current `token`/
   *  `username` — see this file's header for the create-vs-update decision. A no-op if
   *  {@link sourceControlCredentialRowReadyToSave} says this row is not ready. Resolves either way —
   *  a failure is surfaced through that row's own `error`. */
  save: (providerId: AdminSourceControlProviderId) => Promise<void>;

  t: Translate;
}

/** One row's draft input + busy/error state — kept in a map keyed by provider id so each row's own
 *  typing and in-flight save are fully independent of every other row's. */
interface RowFormState {
  token: string;
  username: string;
  saving: boolean;
  error: string | null;
}

function blankRowFormState(): RowFormState {
  return { token: "", username: "", saving: false, error: null };
}

function initialRowFormStates(): Record<AdminSourceControlProviderId, RowFormState> {
  const entries = SOURCE_CONTROL_PROVIDERS.map((provider) => [provider.id, blankRowFormState()] as const);
  return Object.fromEntries(entries) as Record<AdminSourceControlProviderId, RowFormState>;
}

/** Translates a rejected create/update into the exact string {@link useSourceControlCredentials}'s
 *  `save` stores as that row's `error` — pulled out of `save` for the same complexity-budget reason
 *  `use-publish-credentials.hooks.ts`'s own `publishCredentialSubmitErrorMessage` documents.
 *  @complexity O(1). */
function sourceControlCredentialSubmitErrorMessage(err: unknown, t: Translate, locale: string): string {
  const classified = classifySourceControlCredentialSubmitError(err);
  if (classified.kind === "duplicate-label") return t("This connection was already saved — reload the page and try again.");
  if (classified.kind === "validation") return sourceControlCredentialSaveErrorMessage(locale, classified.detail);
  return sourceControlCredentialSaveErrorMessage(locale, describeApiError(err, t("unknown error")));
}

export function useSourceControlCredentials(
  port: SourceControlCredentialsPort,
  t: Translate,
  locale: string
): SourceControlCredentialsController {
  const query = useFetchQuery({ key: ["source-control", "credentials"], fetch: () => port.listCredentials() });
  const [credentials, setCredentials] = useState<AdminSourceControlCredentialSummary[] | undefined>(undefined);

  // Seeds local state from the query's first successful load, exactly once — same shape
  // `use-publish-credentials.hooks.ts`'s own `seededRef` uses. Later changes flow through `save`
  // below, not through the query re-resolving.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || query.status === "loading" || !query.data) return;
    seededRef.current = true;
    setCredentials(query.data.credentials);
  }, [query.status, query.data]);

  const loadError = query.error ? sourceControlCredentialsLoadErrorMessage(locale, describeApiError(query.error, t("unknown error"))) : null;

  const [formStates, setFormStates] = useState<Record<AdminSourceControlProviderId, RowFormState>>(initialRowFormStates);

  function setToken(providerId: AdminSourceControlProviderId, value: string) {
    setFormStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], token: value } }));
  }

  function setUsername(providerId: AdminSourceControlProviderId, value: string) {
    setFormStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], username: value } }));
  }

  async function save(providerId: AdminSourceControlProviderId) {
    const formState = formStates[providerId];
    const fields: SourceControlCredentialFormFields = { providerId, token: formState.token, username: formState.username };
    if (!sourceControlCredentialRowReadyToSave(fields)) return;

    const existing = defaultSourceControlCredentialForProvider(credentials ?? [], providerId);
    setFormStates((prev) => ({ ...prev, [providerId]: { ...prev[providerId], saving: true, error: null } }));
    try {
      const connection = buildSourceControlConnectionInput(fields);
      const result = existing
        ? await port.updateCredential(existing.id, { connection })
        : await port.createCredential({ label: SOURCE_CONTROL_CREDENTIAL_ROW_LABEL, connection });
      setCredentials((prev) => {
        const base = prev ?? [];
        return existing ? base.map((current) => (current.id === result.id ? result : current)) : [...base, result];
      });
      setFormStates((prev) => ({ ...prev, [providerId]: blankRowFormState() }));
    } catch (err) {
      setFormStates((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], saving: false, error: sourceControlCredentialSubmitErrorMessage(err, t, locale) },
      }));
    }
  }

  const rows: readonly SourceControlCredentialRowState[] | undefined =
    credentials === undefined
      ? undefined
      : SOURCE_CONTROL_PROVIDERS.map((provider) => {
          const formState = formStates[provider.id];
          return {
            providerId: provider.id,
            saved: defaultSourceControlCredentialForProvider(credentials, provider.id),
            token: formState.token,
            username: formState.username,
            saving: formState.saving,
            error: formState.error,
          };
        });

  return { rows, loadError, setToken, setUsername, save, t };
}

/**
 * Binds the real `/api/.../system/source-control/credentials` client, and a `t` bound to the real
 * resolved locale — the zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, same
 * shape `use-publish-credentials.hooks.ts`'s `useWiredPublishCredentials` documents.
 */
export function useWiredSourceControlCredentials(): SourceControlCredentialsController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT(locale, key);
  return useSourceControlCredentials(defaultSourceControlCredentialsPort, t, locale);
}
