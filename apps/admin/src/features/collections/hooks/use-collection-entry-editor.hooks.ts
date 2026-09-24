import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  describeApiError,
  type AdminContentType,
  type AdminEntry,
  type AdminTaxonomyWithTerms,
} from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { KEYS, visibleEntryEditorError } from "../rules";
import { WidgetEmbed } from "@/lib/widget-embed-extension";
import { navigate as defaultNavigate } from "@/lib/router";
import { slugRedirectPath } from "@/lib/slug-redirect-path";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { entryLifecycleFailureMessage, t as translate } from "../collections-i18n";
import { defaultCollectionEntryEditorPort } from "./collection-entry-editor-dependencies.hooks";
import type { CollectionEntryEditorPort } from "./collection-entry-editor-port.hooks";

/**
 * @file Everything the collection entry editor does, so `CollectionEntryEditor.tsx` is only
 * markup. Extracted verbatim — same state, same order, same effect, same error strings.
 *
 * `TermPicker`'s own state/actions live in `use-term-picker.hooks.ts` — a separate hook, because
 * it is a genuinely separate stateful unit (its own load-free local state, its own async action)
 * nested inside this screen, not a piece of this editor's own state.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/collections` needs it;
 * promote to `src/hooks/` only when a second feature actually does.
 *
 * `port`/`navigate`/`locale` are injected — see `collection-entry-editor-port.hooks.ts` — rather
 * than reaching `lib/api`/`lib/router`/`useAdminLocale()` directly, so a test can describe load/
 * save/lifecycle outcomes against `createFakeCollectionEntryEditorPort` instead of stubbing global
 * `fetch`. `useWiredCollectionEntryEditor` below is the pair `CollectionEntryEditor.tsx` actually
 * mounts.
 *
 * `t` is now ALSO injected (standing i18n rule, 2026-08-11, superseding this file's earlier
 * "stays a direct import" note above — see `use-collections.hooks.ts`'s identical update) so
 * `CollectionEntryEditor.tsx` sources its UI copy from this hook instead of its own
 * `useAdminLocale()`/`COLLECTIONS_DICT` import. `collections-i18n.ts`'s own `t(locale, key)` —
 * aliased `translate` here to avoid colliding with this file's bound `(key) => string` closure —
 * stays a direct, uninjected import for this hook's OWN error strings: a pure lookup that already
 * takes `locale` explicitly, not a host reach.
 *
 * `lib/fetch-query` migration (2026-08-12): the combined content-type/entry/taxonomies read is one
 * `useFetchQuery` keyed on `KEYS.entry(contentTypeKey, entryId)` — a SIBLING of `use-collection-
 * entries.hooks.ts`'s `KEYS.entries(key)`, deliberately NOT nested under it (see `rules.ts`'s `KEYS`
 * doc for the regression that nesting caused: every save background-refetched this SAME hook's own
 * read, firing 3 extra requests right after the save's own one and breaking several "the last fetch
 * call was the save" test assertions). `save()`/`toggleLifecycle()` still `invalidates:
 * [KEYS.entries(contentTypeKey)]` directly, so the sibling entries LIST still refreshes — this hook's
 * own read just isn't a fellow traveller of that invalidation. It IS still nested under `KEYS.list`,
 * so a content-type field/lifecycle change (from `use-collections.hooks.ts`/`use-edit-fields-
 * dialog.hooks.ts`) still refreshes an open editor, which is wanted. `entry`/`title`/`slug`/
 * `extFields`/the editor's own content stay local `useState` (the user edits them, and `save()`
 * reassigns `entry` from the write's own response) rather than being read directly off `list.data` —
 * `seededIdentityRef` seeds them from `list.data` exactly once per `(contentTypeKey, entryId)` pair,
 * so a background refetch from a `KEYS.list` invalidation doesn't re-seed and silently overwrite
 * in-progress edits. `contentType`/`taxonomies` have no such hazard (nothing local ever mutates them)
 * and are read straight off `list.data` every render.
 */

export interface CollectionEntryEditorController {
  contentType: AdminContentType | null | undefined;
  entry: AdminEntry | null;
  title: string;
  setTitle: (title: string) => void;
  slug: string;
  setSlug: (slug: string) => void;
  extFields: Record<string, unknown>;
  setExtFields: Dispatch<SetStateAction<Record<string, unknown>>>;
  taxonomies: AdminTaxonomyWithTerms[];
  message: string | null;
  error: string | null;
  loadError: string | null;
  loaded: boolean;
  saving: boolean;
  /** True while `save()` OR a lifecycle toggle is in flight — unlike `saving` (Save's own label),
   *  this also covers `toggleLifecycle`'s standalone lifecycle write (Unpublish, and Publish's own
   *  lifecycle leg once its save leg has landed — see H2's `publishWithSave`). Drives `disabled` on
   *  Publish/Unpublish/Save so a second click can't race an in-flight write on the same entry. */
  busy: boolean;
  editor: Editor | null;
  save: () => Promise<void>;
  toggleLifecycle: (op: "publish" | "unpublish") => Promise<void>;
  /** M2: a `json`-kind dynamic field control reports its own parse validity here on every change
   *  (and clears it to valid on unmount) — see `use-json-field-control.hooks.ts`. `save()`/
   *  Publish refuse to write while any field is reporting invalid. */
  setFieldValidity: (fieldName: string, valid: boolean) => void;
  /** Bound translator — `CollectionEntryEditor.tsx`'s only source of UI copy; see this file's own
   *  header. */
  t: (key: string) => string;
}

export interface CollectionEntryEditorDependencies {
  port: CollectionEntryEditorPort;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  locale: string;
  t: (key: string) => string;
}

export function useCollectionEntryEditor(
  props: {
    contentTypeKey: string;
    entryId: string | null;
  },
  deps: CollectionEntryEditorDependencies
): CollectionEntryEditorController {
  const { port, navigate, locale, t } = deps;
  const [entry, setEntry] = useState<AdminEntry | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [extFields, setExtFields] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<string | null>(null);
  // The op the CURRENTLY (or most recently) in-flight `toggleLifecycle` call was for — needed
  // because `entryLifecycleFailureMessage` names it, and unlike `save()` (one fallback string for
  // both create/update), publish/unpublish share one mutation object with no other way to recover
  // which op a given failure was for.
  const [lastLifecycleOp, setLastLifecycleOp] = useState<"publish" | "unpublish" | null>(null);
  // M2: which `json`-kind dynamic fields currently hold unparseable text — see
  // `use-json-field-control.hooks.ts`'s own header. `save()`/`publishWithSave()` refuse to write
  // while this is non-empty, rather than silently sending the last value that DID parse under a
  // "Saved" message (the bug: an entry could show "Saved · version N" for text that was never
  // stored).
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(new Set());
  const [validationError, setValidationError] = useState<string | null>(null);

  /**
   * Stable setter passed down to every dynamic field control (`setFieldValidity` on the
   * controller) — `useCallback` with a functional update, so a field re-reporting the SAME
   * validity it already had returns the identical `Set` instance rather than a new one, keeping
   * `invalidFields` referentially stable across renders that don't actually change it.
   *
   * @complexity Time/space: O(1) amortized — a `Set` copy only on an actual validity flip.
   */
  const setFieldValidity = useCallback((fieldName: string, valid: boolean) => {
    setInvalidFields((current) => {
      const currentlyInvalid = current.has(fieldName);
      if (valid === !currentlyInvalid) return current;
      const next = new Set(current);
      if (valid) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  }, []);

  const editor = useEditor({ extensions: [StarterKit, WidgetEmbed], content: "" });

  const list = useFetchQuery({
    key: KEYS.entry(props.contentTypeKey, props.entryId),
    fetch: async () => {
      const [typesResult, entriesResult, taxonomyResult] = await Promise.all([
        port.listContentTypes(),
        props.entryId ? port.listEntries({ type: props.contentTypeKey }) : Promise.resolve({ items: [] as AdminEntry[] }),
        port.listTaxonomies().catch(() => ({ items: [] as AdminTaxonomyWithTerms[] })),
      ]);
      return {
        contentType: typesResult.items.find((type) => type.key === props.contentTypeKey) ?? null,
        // Id or slug (readable-slugs S6b) — id first, since entry slugs are only unique per content
        // type while ids are globally unique; a slug is checked only when the id lookup misses.
        entry: props.entryId
          ? (entriesResult.items.find((e) => e.id === props.entryId || e.slug === props.entryId) ?? null)
          : null,
        taxonomies: taxonomyResult.items,
      };
    },
  });

  const contentType = list.data?.contentType;
  const taxonomies = list.data?.taxonomies ?? [];
  const loaded = list.status !== "loading";
  const loadError = list.error ? describeApiError(list.error, translate(locale, "failed to load entry")) : null;

  // Seeds `entry`/`title`/`slug`/`extFields`/the editor's content from `list.data` exactly once per
  // `(contentTypeKey, entryId)` identity — see this file's own header for why a background refetch
  // of the SAME identity (e.g. this hook's own `save()` invalidating its parent key) must NOT re-run
  // this and clobber in-progress edits.
  const seededIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    const identity = `${props.contentTypeKey}:${props.entryId ?? "new"}`;
    if (seededIdentityRef.current !== identity) seededIdentityRef.current = null;
    if (!editor || list.status === "loading" || !list.data) return;
    if (seededIdentityRef.current === identity) return;
    seededIdentityRef.current = identity;

    const found = list.data.entry;
    setEntry(found);
    if (found) {
      setTitle(found.title);
      setSlug(found.slug);
      setExtFields(
        ((): Record<string, unknown> => {
          const site = (found.fieldsJson as { ext?: { site?: Record<string, unknown> } } | null)?.ext?.site;
          return site ? { ...site } : {};
        })()
      );
      editor.commands.setContent((found.bodyJson ?? "") as never);
      // readable-slugs S6b: an old id-based bookmark quietly catches up to the slug URL, same
      // `slugRedirectPath` (`lib/slug-redirect-path.ts`) rule posts/pages/widgets/menus already apply.
      if (props.entryId) {
        const redirectPath = slugRedirectPath(`/collections/${props.contentTypeKey}`, props.entryId, found);
        if (redirectPath) navigate(redirectPath, { replace: true });
      }
    } else {
      setTitle("");
      setSlug("");
      setExtFields({});
      editor.commands.setContent("");
    }
  }, [props.contentTypeKey, props.entryId, editor, list.status, list.data]);

  const updateMutation = useFetchMutation({
    run: (input: { target: { id: string; expectedVersion: number }; patch: { title?: string; fieldsJson?: unknown; bodyJson?: unknown } }) =>
      port.updateEntry(input.target, input.patch),
    invalidates: [KEYS.entries(props.contentTypeKey)],
  });
  const createMutation = useFetchMutation({
    run: (input: { input: { type: string; slug: string; title: string }; options: { fieldsJson?: unknown; bodyJson?: unknown } }) =>
      port.createEntry(input.input, input.options),
    invalidates: [KEYS.entries(props.contentTypeKey)],
  });
  const lifecycleMutation = useFetchMutation({
    run: (input: { id: string; op: "publish" | "unpublish"; expectedVersion: number }) => port.entryLifecycle(input),
    invalidates: [KEYS.entries(props.contentTypeKey)],
  });

  /**
   * Writes the existing entry's current working copy (title/fields/body) through `updateMutation`
   * and mirrors the saved row into `entry` — the one place that write happens, shared by `save()`
   * and H2's `publishWithSave()` (Publish must save the working copy before it publishes it; see
   * this file's own module header / the H2 fix notes for why the two were unified rather than
   * publish going straight to `lifecycleMutation` against the stale, already-loaded `entry.version`).
   *
   * @complexity Time/space: O(1) — one mutation call, one state write.
   */
  async function saveExisting(current: AdminEntry): Promise<AdminEntry> {
    const { entry: saved } = await updateMutation.mutate({
      target: { id: current.id, expectedVersion: current.version },
      // `bodyJson` was omitted here while the create branch below sent it, so editing an existing
      // entry's rich text reported "Saved · version N" and left the stored body untouched. Silent
      // data loss on the primary content surface; `PostEditor` has always done this correctly.
      patch: { title, fieldsJson: { ext: { site: extFields } }, bodyJson: editor?.getJSON() },
    });
    setEntry(saved);
    return saved;
  }

  async function save() {
    if (!contentType || !editor) return;
    setMessage(null);
    setValidationError(null);
    if (invalidFields.size > 0) {
      setValidationError(translate(locale, "Fix the invalid JSON before saving."));
      return;
    }
    try {
      if (entry) {
        const saved = await saveExisting(entry);
        setMessage(`Saved · version ${saved.version}`);
      } else {
        const { entry: created } = await createMutation.mutate({
          input: { type: props.contentTypeKey, slug: slug.trim(), title },
          options: { fieldsJson: { ext: { site: extFields } }, bodyJson: editor.getJSON() },
        });
        setEntry(created);
        setMessage(`Created · version ${created.version}`);
        navigate(`/collections/${props.contentTypeKey}/${created.slug}`);
      }
    } catch {
      // already surfaced through updateMutation.error/createMutation.error -> error below
    }
  }

  /**
   * H2 fix: Publish was wired straight to `lifecycleMutation`, so it published whatever was last
   * SAVED, silently dropping any edit made since — the button's own label claims it saves "its
   * current title, fields and body". This saves the working copy first (through `saveExisting`,
   * shared with `save()`) and only publishes once that save lands, against the SAVE's own new
   * version rather than the stale `entry.version` a same-tick save+publish would otherwise race.
   * A save failure stops here (its own error already surfaces via `updateMutation.error`) and
   * leaves the entry unpublished — the safe direction, per the plan's own fix note.
   *
   * @complexity Time/space: O(1) — at most two sequential mutation calls.
   */
  async function publishWithSave(current: AdminEntry) {
    if (!editor) return;
    setMessage(null);
    setValidationError(null);
    if (invalidFields.size > 0) {
      setValidationError(translate(locale, "Fix the invalid JSON before saving."));
      return;
    }
    setLastLifecycleOp("publish");
    let saved: AdminEntry;
    try {
      saved = await saveExisting(current);
    } catch {
      return; // already surfaced through updateMutation.error -> error below
    }
    try {
      const { entry: published } = await lifecycleMutation.mutate({
        id: saved.id,
        op: "publish",
        expectedVersion: saved.version,
      });
      setEntry(published);
      setMessage(`Entry published · version ${published.version}`);
    } catch {
      // already surfaced through lifecycleMutation.error -> error below
    }
  }

  async function toggleLifecycle(op: "publish" | "unpublish") {
    if (!entry) return;
    if (op === "publish") {
      await publishWithSave(entry);
      return;
    }
    setLastLifecycleOp(op);
    try {
      const { entry: saved } = await lifecycleMutation.mutate({ id: entry.id, op, expectedVersion: entry.version });
      setEntry(saved);
      setMessage(`Entry ${op}ed · version ${saved.version}`);
    } catch {
      // already surfaced through lifecycleMutation.error -> error below
    }
  }

  const saving = updateMutation.status === "pending" || createMutation.status === "pending";
  // Publish now folds a save into its lifecycle write (H2), so a second click must be blocked for
  // BOTH legs, not just the save leg `saving` alone would cover.
  const busy = saving || lifecycleMutation.status === "pending";
  // Precedence logic lives in `rules.ts`'s `visibleEntryEditorError` — extracted out of this hook
  // (not just for the usual "computes a value" reason, but because the branching here pushed the
  // hook's own complexity over ESLint's ceiling). `validationError` (M2) takes precedence over it,
  // mirroring `use-new-content-type-dialog`'s own local-validation-first ordering: an unparseable
  // JSON field blocks the write entirely, so its message should win over a stale mutation error
  // from a previous attempt.
  const error = validationError ?? visibleEntryEditorError({
    updateError: updateMutation.error,
    createError: createMutation.error,
    lifecycleError: lifecycleMutation.error,
    saveFallback: translate(locale, "save failed"),
    lifecycleFallback: lastLifecycleOp ? entryLifecycleFailureMessage(locale, lastLifecycleOp) : null,
  });

  return {
    contentType,
    entry,
    title,
    setTitle,
    slug,
    setSlug,
    extFields,
    setExtFields,
    taxonomies,
    message,
    error,
    loadError,
    loaded,
    saving,
    busy,
    editor,
    save,
    toggleLifecycle,
    setFieldValidity,
    t,
  };
}

/**
 * Binds the real `/api/.../content-types`+`/entries` client, `lib/router`'s `navigate`, the
 * resolved `useAdminLocale()` value, and a `COLLECTIONS_DICT`-bound translator — see
 * `collection-entry-editor-dependencies.hooks.ts`. The zero-argument-deps half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `CollectionEntryEditor.tsx` composes this and a
 * test composes {@link useCollectionEntryEditor} with `createFakeCollectionEntryEditorPort`.
 */
export function useWiredCollectionEntryEditor(props: {
  contentTypeKey: string;
  entryId: string | null;
}): CollectionEntryEditorController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return useCollectionEntryEditor(props, { port: defaultCollectionEntryEditorPort, navigate: defaultNavigate, locale, t });
}
