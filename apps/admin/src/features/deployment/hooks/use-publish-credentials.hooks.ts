import { useEffect, useRef, useState } from "react";

import {
  describeApiError,
  type AdminPublishCredentialProviderId,
  type AdminPublishCredentialSummary,
  type AdminPublishExecutionMode,
} from "../../../lib/api";
import { useFetchQuery } from "../../../lib/fetch-query";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import {
  t as defaultT,
  publishCredentialDeleteErrorMessage,
  publishCredentialSaveErrorMessage,
  publishCredentialsLoadErrorMessage,
} from "../deployment-i18n";
import type { Translate } from "../../../lib/dictionary-translator";
import {
  buildPublishConnectionInput,
  classifyPublishCredentialSubmitError,
  publishCredentialFormReadyToSubmit,
  type PublishCredentialFormFields,
} from "../rules";
import { defaultPublishCredentialsPort } from "./publish-credentials-dependencies.hooks";
import type { PublishCredentialsPort } from "./publish-credentials-port.hooks";

/**
 * @file The Static Site tab's credential-management section — list, add, edit, delete, and the
 * `executionMode` the section's own disclosure switches on. See `StaticSiteTab.tsx`'s credential
 * section header for the UI half of this story.
 *
 * ## One form, four shapes, and why every field lives in this hook regardless of the selected provider
 *
 * Same reasoning `use-static-publish.hooks.ts`'s own header gives for its two-target form, one
 * union arm wider: `token`/`owner`/`repo`/`teamId`/`siteId`/`accountId`/`projectName` all live here
 * at once, and {@link buildPublishConnectionInput} (`rules.ts`) reads only the ones the current
 * `providerId` actually uses. Switching providers mid-edit never discards whatever the operator
 * already typed into another provider's fields.
 *
 * ## A stored credential is NEVER read back — this is why `startEdit` blanks every connection field
 *
 * `AdminPublishCredentialSummary` carries no token, no ciphertext, and deliberately no masked
 * suffix (see that type's own doc in `lib/api.ts`). So {@link PublishCredentialsController.startEdit}
 * can only seed `providerId` and `label` from the row being edited — every connection field starts
 * blank, on purpose, every time. A blank `token` at submit time is therefore not "the operator left
 * it empty by mistake"; it is the ONLY way this form can express "keep the stored secret, just
 * change the label" — {@link submit} below reads it as exactly that and omits `connection` from the
 * `PUT` entirely rather than sending a half-built one. Typing any character into `token` is what
 * commits to replacing the whole connection, at which point every other required field for that
 * provider is re-validated same as a fresh add (`publishCredentialFormReadyToSubmit`'s own doc).
 *
 * ## The list is optimistically maintained locally, not refetched after every write
 *
 * `create`/`update`/`delete` splice their own result into the local `credentials` array rather than
 * re-running `listCredentials()` — one round trip per write instead of two, and the row a caller
 * just added/edited/removed is exactly the row `AdminPublishCredentialSummary` the server handed
 * back, so there is nothing a refetch would reveal that the response did not already contain.
 */
export interface PublishCredentialsController {
  /** `undefined` until the first load resolves — same "no data yet" convention every other
   *  hook in this panel uses (`StaticExportController.run`, `StaticPublishController.run`). */
  credentials: AdminPublishCredentialSummary[] | undefined;
  /** The server's own execution capability for this instance — `undefined` until the same first
   *  load resolves. Never derived any other way; see `AdminPublishExecutionMode`'s doc. */
  executionMode: AdminPublishExecutionMode | undefined;
  loadError: string | null;

  /** Whether the add/edit form is currently shown at all — distinct from `editingId`, since a
   *  freshly-mounted tab shows neither a form nor an editing row. */
  isFormOpen: boolean;
  /** `null` while adding a new credential; the row's `id` while editing an existing one. */
  editingId: string | null;

  providerId: AdminPublishCredentialProviderId;
  setProviderId: (value: AdminPublishCredentialProviderId) => void;
  label: string;
  setLabel: (value: string) => void;
  /** Blank always means "unchanged" while editing — see this file's header. */
  token: string;
  setToken: (value: string) => void;
  owner: string;
  setOwner: (value: string) => void;
  repo: string;
  setRepo: (value: string) => void;
  teamId: string;
  setTeamId: (value: string) => void;
  siteId: string;
  setSiteId: (value: string) => void;
  accountId: string;
  setAccountId: (value: string) => void;
  projectName: string;
  setProjectName: (value: string) => void;

  /** Opens the form in ADD mode: no `editingId`, `providerId` reset to GitHub Pages, every field
   *  blank. */
  startAdd: () => void;
  /** Opens the form in EDIT mode for one existing row — seeds `providerId`/`label` from it and
   *  blanks every connection field (see this file's header for why). */
  startEdit: (credential: AdminPublishCredentialSummary) => void;
  /** Closes the form without submitting — discards whatever is currently typed. */
  cancelForm: () => void;

  submitting: boolean;
  formError: string | null;
  /** Creates (no `editingId`) or updates (`editingId` set) with the current field values. A no-op
   *  if {@link publishCredentialFormReadyToSubmit} says the form is not ready — the same guard the
   *  UI's own Save button is disabled on, kept here too so a direct call (as this file's own tests
   *  make) cannot bypass it. Resolves either way — a failure is surfaced through {@link formError}. */
  submit: () => Promise<void>;

  /** The row currently being deleted, if any — drives a per-row busy state without disabling every
   *  other row's own Delete button. */
  deletingId: string | null;
  deleteError: string | null;
  /** Deletes one credential by id. Resolves either way — a failure is surfaced through
   *  {@link deleteError}. Closes the form first if the row being deleted is also the one being
   *  edited, so the form cannot keep referencing a row that no longer exists. */
  remove: (id: string) => Promise<void>;

  t: Translate;
}

/** Blanks every connection field — shared by {@link usePublishCredentials}'s `startAdd`/`startEdit`,
 *  since both start from a clean slate (a new credential has none yet; an existing one's are never
 *  returned to blank into). Takes the seven setters rather than a single "reset" state action so it
 *  stays a plain function next to the hook's own `useState` calls, matching this file's
 *  no-reducer convention (mirrors `use-static-publish.hooks.ts`'s own per-field setters). */
function blankConnectionFields(setters: {
  setToken: (value: string) => void;
  setOwner: (value: string) => void;
  setRepo: (value: string) => void;
  setTeamId: (value: string) => void;
  setSiteId: (value: string) => void;
  setAccountId: (value: string) => void;
  setProjectName: (value: string) => void;
}) {
  setters.setToken("");
  setters.setOwner("");
  setters.setRepo("");
  setters.setTeamId("");
  setters.setSiteId("");
  setters.setAccountId("");
  setters.setProjectName("");
}

/** Runs the actual create-or-update write for {@link usePublishCredentials}'s `submit` — pulled out
 *  so `submit` itself does not ALSO carry the add-vs-edit branch on top of its own ready-guard and
 *  busy/success bookkeeping (this file's complexity budget, same reasoning
 *  `StaticSiteTab.tsx`'s per-provider field split documents one file over). `editingId` is only
 *  read for `mode: "edit"`, and `submit` only reaches that branch once `editingId` is already
 *  non-null (see this file's header on how `mode` and `editingId` stay in lockstep).
 *  @complexity O(1) plus one network round trip. */
async function writePublishCredential(
  port: PublishCredentialsPort,
  mode: "add" | "edit",
  editingId: string | null,
  fields: PublishCredentialFormFields,
  label: string,
  token: string
): Promise<AdminPublishCredentialSummary> {
  if (mode === "add") {
    return port.createCredential({ label: label.trim(), connection: buildPublishConnectionInput(fields) });
  }
  // Blank token = keep the stored secret untouched — see this file's header. Any other value
  // commits to a full connection replace, re-validated by `submit`'s own guard before this runs.
  const connectionChanged = token.trim() !== "";
  return port.updateCredential(editingId as string, {
    label: label.trim(),
    ...(connectionChanged ? { connection: buildPublishConnectionInput(fields) } : {}),
  });
}

/** Translates a rejected create/update into the exact string `submit` shows as `formError` — pulled
 *  out of `submit` for the same complexity-budget reason {@link writePublishCredential} documents.
 *  Layers `classifyPublishCredentialSubmitError`'s (`rules.ts`) specific cases over the shared
 *  `describeApiError` base case, same "check specific codes first, fall through to the shared base"
 *  convention `lib/api.ts`'s own `describeApiError` doc recommends every screen follow.
 *  @complexity O(1). */
function publishCredentialSubmitErrorMessage(err: unknown, t: Translate, locale: string): string {
  const classified = classifyPublishCredentialSubmitError(err);
  if (classified.kind === "duplicate-label") return t("A credential with this label already exists.");
  if (classified.kind === "validation") return publishCredentialSaveErrorMessage(locale, classified.detail);
  return publishCredentialSaveErrorMessage(locale, describeApiError(err, "unknown error"));
}

export function usePublishCredentials(port: PublishCredentialsPort, t: Translate, locale: string): PublishCredentialsController {
  const query = useFetchQuery({ key: ["deployment", "publish-credentials"], fetch: () => port.listCredentials() });
  const [credentials, setCredentials] = useState<AdminPublishCredentialSummary[] | undefined>(undefined);
  const [executionMode, setExecutionMode] = useState<AdminPublishExecutionMode | undefined>(undefined);

  // Seeds local state from the query's first successful load, exactly once — same shape
  // `use-static-publish.hooks.ts`'s own `seededRef` uses. Later changes flow through the CRUD
  // handlers below, not through the query re-resolving (see this file's header on why writes are
  // optimistic rather than refetch-driven).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || query.status === "loading" || !query.data) return;
    seededRef.current = true;
    setCredentials(query.data.credentials);
    setExecutionMode(query.data.executionMode);
  }, [query.status, query.data]);

  const loadError = query.error ? publishCredentialsLoadErrorMessage(locale, describeApiError(query.error, "unknown error")) : null;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<AdminPublishCredentialProviderId>("github-pages");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [teamId, setTeamId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function startAdd() {
    setEditingId(null);
    setProviderId("github-pages");
    setLabel("");
    blankConnectionFields({ setToken, setOwner, setRepo, setTeamId, setSiteId, setAccountId, setProjectName });
    setFormError(null);
    setIsFormOpen(true);
  }

  function startEdit(credential: AdminPublishCredentialSummary) {
    setEditingId(credential.id);
    setProviderId(credential.providerId);
    setLabel(credential.label);
    blankConnectionFields({ setToken, setOwner, setRepo, setTeamId, setSiteId, setAccountId, setProjectName });
    setFormError(null);
    setIsFormOpen(true);
  }

  function cancelForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  async function submit() {
    const mode: "add" | "edit" = editingId === null ? "add" : "edit";
    const fields: PublishCredentialFormFields = { providerId, token, owner, repo, teamId, siteId, accountId, projectName };
    if (!publishCredentialFormReadyToSubmit(fields, mode, label)) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const result = await writePublishCredential(port, mode, editingId, fields, label, token);
      setCredentials((prev) =>
        mode === "add" ? [...(prev ?? []), result] : (prev ?? []).map((existing) => (existing.id === result.id ? result : existing))
      );
      setIsFormOpen(false);
      setEditingId(null);
    } catch (err) {
      setFormError(publishCredentialSubmitErrorMessage(err, t, locale));
    } finally {
      setSubmitting(false);
    }
  }

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await port.deleteCredential(id);
      setCredentials((prev) => (prev ?? []).filter((existing) => existing.id !== id));
      if (editingId === id) cancelForm();
    } catch (err) {
      setDeleteError(publishCredentialDeleteErrorMessage(locale, describeApiError(err, "unknown error")));
    } finally {
      setDeletingId(null);
    }
  }

  return {
    credentials,
    executionMode,
    loadError,
    isFormOpen,
    editingId,
    providerId,
    setProviderId,
    label,
    setLabel,
    token,
    setToken,
    owner,
    setOwner,
    repo,
    setRepo,
    teamId,
    setTeamId,
    siteId,
    setSiteId,
    accountId,
    setAccountId,
    projectName,
    setProjectName,
    startAdd,
    startEdit,
    cancelForm,
    submitting,
    formError,
    submit,
    deletingId,
    deleteError,
    remove,
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
