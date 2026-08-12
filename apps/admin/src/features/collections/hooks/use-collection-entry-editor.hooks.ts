import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  describeApiError,
  type AdminContentType,
  type AdminEntry,
  type AdminTaxonomyWithTerms,
} from "../../../lib/api";
import { WidgetEmbed } from "../../../lib/widget-embed-extension";
import { navigate as defaultNavigate } from "../../../lib/router";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { entryLifecycleFailureMessage, t } from "../collections-i18n";
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
 * mounts. `t` stays a direct import — a pure, no-I/O string lookup, same category as
 * `describeApiError` (see this module's own "what stays a direct import" precedent set by every
 * other `features/collections` hook converted this session: `use-collections.hooks.ts`,
 * `use-new-content-type-dialog.hooks.ts`, `use-term-picker.hooks.ts`), not the four-things-injected
 * shape `use-page-editor.hooks.ts` demonstrates elsewhere.
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
  editor: Editor | null;
  save: () => Promise<void>;
  toggleLifecycle: (op: "publish" | "unpublish") => Promise<void>;
}

export interface CollectionEntryEditorDependencies {
  port: CollectionEntryEditorPort;
  navigate: (path: string) => void;
  locale: string;
}

export function useCollectionEntryEditor(
  props: {
    contentTypeKey: string;
    entryId: string | null;
  },
  deps: CollectionEntryEditorDependencies
): CollectionEntryEditorController {
  const { port, navigate, locale } = deps;
  const [contentType, setContentType] = useState<AdminContentType | null | undefined>(undefined);
  const [entry, setEntry] = useState<AdminEntry | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [extFields, setExtFields] = useState<Record<string, unknown>>({});
  const [taxonomies, setTaxonomies] = useState<AdminTaxonomyWithTerms[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const editor = useEditor({ extensions: [StarterKit, WidgetEmbed], content: "" });

  useEffect(() => {
    setLoadError(null);
    setLoaded(false);
    setContentType(undefined);
    setEntry(null);

    Promise.all([
      port.listContentTypes(),
      props.entryId ? port.listEntries({ type: props.contentTypeKey }) : Promise.resolve({ items: [] as AdminEntry[] }),
      port.listTaxonomies().catch(() => ({ items: [] as AdminTaxonomyWithTerms[] })),
    ])
      .then(([typesResult, entriesResult, taxonomyResult]) => {
        const ct = typesResult.items.find((t) => t.key === props.contentTypeKey) ?? null;
        setContentType(ct);
        setTaxonomies(taxonomyResult.items);

        if (props.entryId) {
          const found = entriesResult.items.find((e) => e.id === props.entryId) ?? null;
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
            editor?.commands.setContent((found.bodyJson ?? "") as never);
          }
        } else {
          setTitle("");
          setSlug("");
          setExtFields({});
          editor?.commands.setContent("");
        }
      })
      .catch((e) => setLoadError(describeApiError(e, t(locale, "failed to load entry"))))
      .finally(() => setLoaded(true));
    // `port` is added — see `use-page-editor.hooks.ts`'s identical note: a function-scoped value
    // ESLint's exhaustive-deps rule can see, referentially stable in production, so this changes
    // nothing about when the effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.contentTypeKey, props.entryId, editor === null, port]);

  async function save() {
    if (!contentType || !editor) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const fieldsJson = { ext: { site: extFields } };
      if (entry) {
        const { entry: saved } = await port.updateEntry(
          { id: entry.id, expectedVersion: entry.version },
          // `bodyJson` was omitted here while the create branch below sent it,
          // so editing an existing entry's rich text reported "Saved · version N"
          // and left the stored body untouched. Silent data loss on the primary
          // content surface; `PostEditor` has always done this correctly.
          { title, fieldsJson, bodyJson: editor.getJSON() }
        );
        setEntry(saved);
        setMessage(`Saved · version ${saved.version}`);
      } else {
        const { entry: created } = await port.createEntry(
          { type: props.contentTypeKey, slug: slug.trim(), title },
          { fieldsJson, bodyJson: editor.getJSON() }
        );
        setEntry(created);
        setMessage(`Created · version ${created.version}`);
        navigate(`/collections/${props.contentTypeKey}/${created.id}`);
      }
    } catch (e) {
      setError(describeApiError(e, t(locale, "save failed")));
    } finally {
      setSaving(false);
    }
  }

  async function toggleLifecycle(op: "publish" | "unpublish") {
    if (!entry) return;
    setError(null);
    try {
      const { entry: saved } = await port.entryLifecycle({ id: entry.id, op, expectedVersion: entry.version });
      setEntry(saved);
      setMessage(`Entry ${op}ed · version ${saved.version}`);
    } catch (e) {
      setError(describeApiError(e, entryLifecycleFailureMessage(locale, op)));
    }
  }

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
    editor,
    save,
    toggleLifecycle,
  };
}

/**
 * Binds the real `/api/.../content-types`+`/entries` client, `lib/router`'s `navigate`, and the
 * resolved `useAdminLocale()` value — see `collection-entry-editor-dependencies.hooks.ts`. The
 * zero-argument-deps half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `CollectionEntryEditor.tsx` composes this and a test composes {@link useCollectionEntryEditor}
 * with `createFakeCollectionEntryEditorPort`.
 */
export function useWiredCollectionEntryEditor(props: {
  contentTypeKey: string;
  entryId: string | null;
}): CollectionEntryEditorController {
  const locale = useAdminLocale();
  return useCollectionEntryEditor(props, { port: defaultCollectionEntryEditorPort, navigate: defaultNavigate, locale });
}
