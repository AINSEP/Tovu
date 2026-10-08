import { useEffect, useState } from "react";
import { describeApiError, type AdminTaxonomyWithTerms } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../taxonomy-i18n";
import { hasPermission } from "@jini-ai/ui/panel-kit";
import { KEYS, TAXONOMY_MANAGE_PERMISSION, findTermByName, splitTermNames, termPickerSubject } from "../rules";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { defaultTermPickerPort } from "./term-picker-dependencies.hooks";
import type { TermPickerPort } from "./term-picker-port.hooks";

/**
 * @file `TermPicker`'s own state and async action — the Categories & Tags box the post, page and
 * collection-entry editors all mount (`TermPicker.tsx`). One content ref (`contentType` +
 * `contentId`: `post`/`page` + the post id, or a collection key + the entry id) is all it needs; it
 * reads the taxonomy list and the content's own terms itself, so an editor passes nothing else.
 *
 * `port`/`locale` are injected — see `term-picker-port.hooks.ts` — so a test describes the outcome
 * against `createFakeTermPickerPort` instead of stubbing global `fetch`. `useWiredTermPicker` below is
 * the pair `TermPicker.tsx` actually mounts.
 *
 * The taxonomy list shares the Categories & Tags screen's own cache key (`KEYS.list`), so a term
 * added there shows here without a reload. The boxes start ticked for the terms the content holds
 * (`assignedTerms`, `KEYS.assignedTerms`). Ticking/unticking edits a local draft; Save sends the
 * difference — `assignTerms` for the added ids, `unassignTerms` for the removed ones — then re-reads.
 * The draft is kept after a save, so a box ticked while the save was in flight stays ticked (M1) and
 * simply shows as a new unsaved change.
 *
 * Adding a term by name (2026-09-26): each taxonomy row has an add input — always shown for a tag
 * box (`hierarchical: false`) and for a taxonomy with no terms yet, behind "+ Add term" for a
 * category box that already has some. Enter (or a comma, in a tag box) adds what was typed: a name
 * that matches an existing term, ignoring case, just ticks that term; a new one is created through
 * the Categories & Tags screen's own create-term port (`port.createTerm`, invalidating `KEYS.list`
 * the same way) and then ticked. The create is immediate — a term needs an id before it can be
 * ticked — but putting it on this content still waits for Save, like every other tick. The input
 * shows only when the admin holds `admin.taxonomy.manage` (UX only; the route is the boundary).
 */

export interface TermPickerController {
  taxonomies: AdminTaxonomyWithTerms[];
  /** No taxonomy exists at all — the box has nothing to offer and is not shown. */
  hidden: boolean;
  /** What the box's agent labels call the tagged content. */
  subject: "post" | "page" | "entry";
  selected: Set<string>;
  toggle: (termId: string) => void;
  /** The first read of the taxonomies or of the content's terms has not landed yet. */
  loading: boolean;
  /** The ticked set differs from what the content holds. */
  dirty: boolean;
  saving: boolean;
  message: string | null;
  error: string | null;
  save: () => Promise<void>;
  /** This feature's dictionary, bound to the admin locale. */
  t: Translate;
  /** The admin may create terms — without it no add input or trigger shows. */
  canCreate: boolean;
  /** This taxonomy's add input is on screen. */
  showAddInput: (taxonomyId: string) => boolean;
  /** This (category) taxonomy shows "+ Add term" to open its add input. */
  showAddTrigger: (taxonomyId: string) => boolean;
  setAddOpen: (taxonomyId: string, open: boolean) => void;
  /** What is typed in this taxonomy's add input. */
  newTermName: (taxonomyId: string) => string;
  setNewTermName: (taxonomyId: string, name: string) => void;
  /** Enter adds what was typed; so does a comma in a tag box. Escape closes an opened category input. */
  onNewTermKeyDown: (taxonomyId: string, event: { key: string; nativeEvent?: { isComposing: boolean }; preventDefault(): void }) => void;
  /** Ticks the typed name's existing term, or creates it and ticks it. */
  addTerm: (taxonomyId: string) => Promise<void>;
  /** A term is being created in this taxonomy. */
  creating: (taxonomyId: string) => boolean;
  createError: (taxonomyId: string) => string | null;
  /** This taxonomy's terms not ticked yet — the add input's suggestions. */
  suggestions: (taxonomyId: string) => string[];
}

export interface TermPickerDependencies {
  port: TermPickerPort;
  locale: string;
}

/** Which post, page or collection entry the picker tags. */
export interface TermPickerTarget {
  contentType: string;
  contentId: string;
}

const NO_TERMS: readonly string[] = [];
const NO_TAXONOMIES: AdminTaxonomyWithTerms[] = [];

/** The ids in `from` that are not in `other`. */
function missingFrom(from: Iterable<string>, other: ReadonlySet<string>): string[] {
  return [...from].filter((id) => !other.has(id));
}

export function useTermPicker(props: TermPickerTarget, deps: TermPickerDependencies): TermPickerController {
  const { port, locale } = deps;
  const target = { contentType: props.contentType, contentId: props.contentId };
  const key = KEYS.assignedTerms(props.contentType, props.contentId);
  // Same fetch (and so the same cached `{ items }` shape) as `use-taxonomy.hooks.ts`'s list read —
  // two readers of one key must store one shape.
  const taxonomiesQuery = useFetchQuery({ key: KEYS.list, fetch: () => port.listTaxonomies() });
  const assignedQuery = useFetchQuery({ key, fetch: async () => (await port.assignedTerms(target)).termIds });
  const taxonomies = taxonomiesQuery.data?.items ?? NO_TAXONOMIES;
  const assigned = new Set(assignedQuery.data ?? NO_TERMS);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // A draft belongs to one content ref; changing the query key must also drop its local edits.
  useEffect(() => {
    setDraft(null);
    setMessage(null);
  }, [props.contentType, props.contentId]);
  const selected = draft ?? assigned;
  const permissionsQuery = useFetchQuery({ key: KEYS.permissions, fetch: () => port.me() });
  const canCreate = hasPermission({ permissions: permissionsQuery.data?.effectivePermissions ?? [], permission: TAXONOMY_MANAGE_PERMISSION });
  const [names, setNames] = useState<Record<string, string>>({});
  const [openAdds, setOpenAdds] = useState<ReadonlySet<string>>(new Set());
  /** The taxonomy the last create was for — `createMutation`'s error and pending state belong to it. */
  const [createTarget, setCreateTarget] = useState<string | null>(null);

  const saveMutation = useFetchMutation({
    run: async ({ input }: { input: { add: string[]; remove: string[] } }) => {
      if (input.add.length > 0) await port.assignTerms({ ...target, termIds: input.add });
      if (input.remove.length > 0) await port.unassignTerms({ ...target, termIds: input.remove });
    },
  }, {
    invalidates: [key],
  });

  const createMutation = useFetchMutation({
    run: ({ input }: { input: { taxonomyId: string; name: string } }) => port.createTerm(input),
  }, {
    invalidates: [KEYS.list],
  });

  function tick(termIds: string[]) {
    setMessage(null);
    setDraft((current) => new Set([...(current ?? assigned), ...termIds]));
  }

  function groupOf(taxonomyId: string) {
    return taxonomies.find((group) => group.taxonomy.id === taxonomyId);
  }

  function setNewTermName(taxonomyId: string, name: string) {
    if (createTarget === taxonomyId) setCreateTarget(null);
    setNames((current) => ({ ...current, [taxonomyId]: name }));
  }

  function setAddOpen(taxonomyId: string, open: boolean) {
    setOpenAdds((current) => {
      const next = new Set(current);
      if (open) next.add(taxonomyId);
      else next.delete(taxonomyId);
      return next;
    });
  }

  async function addTerm(taxonomyId: string) {
    const group = groupOf(taxonomyId);
    if (!group) return;
    const wanted = splitTermNames(names[taxonomyId] ?? "", group.taxonomy.hierarchical);
    if (wanted.length === 0) return;
    setCreateTarget(taxonomyId);
    const ids: string[] = [];
    try {
      for (const name of wanted) {
        const existing = findTermByName(group.terms, name);
        ids.push(existing ? existing.id : (await createMutation.mutate({ input: { taxonomyId, name } })).term.id);
      }
    } catch {
      // already surfaced through createMutation.error -> createError below; the terms added
      // before the failure stay ticked and the typed text stays for a retry
      tick(ids);
      return;
    }
    tick(ids);
    setCreateTarget(null);
    setNames((current) => ({ ...current, [taxonomyId]: "" }));
    setAddOpen(taxonomyId, false);
  }

  function onNewTermKeyDown(taxonomyId: string, event: { key: string; nativeEvent?: { isComposing: boolean }; preventDefault(): void }) {
    // Enter/comma can belong to the IME conversion rather than to the term picker.
    if (event.nativeEvent?.isComposing) return;
    const hierarchical = groupOf(taxonomyId)?.taxonomy.hierarchical ?? true;
    if (event.key === "Escape") {
      // Closes a category box's opened input; one that is always shown just stays.
      setAddOpen(taxonomyId, false);
      return;
    }
    if (event.key !== "Enter" && !(event.key === "," && !hierarchical)) return;
    // Also keeps Enter from submitting an editor form the box sits inside.
    event.preventDefault();
    void addTerm(taxonomyId);
  }

  function showAddInput(taxonomyId: string): boolean {
    const group = groupOf(taxonomyId);
    if (!canCreate || !group) return false;
    return !group.taxonomy.hierarchical || group.terms.length === 0 || openAdds.has(taxonomyId);
  }

  function toggle(termId: string) {
    setMessage(null);
    setDraft((current) => {
      const next = new Set(current ?? assigned);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  }

  const add = missingFrom(selected, assigned);
  const remove = missingFrom(assigned, selected);
  const dirty = add.length > 0 || remove.length > 0;

  async function save() {
    if (!dirty) return;
    setMessage(null);
    try {
      await saveMutation.mutate({ input: { add, remove } });
      setMessage(t({ locale: locale, key: "Categories & tags saved." }));
    } catch {
      // already surfaced through saveMutation.error -> error below
    }
  }

  const loadError = assignedQuery.error ?? taxonomiesQuery.error;
  const error = saveMutation.error
    ? describeApiError(saveMutation.error, t({ locale: locale, key: "Failed to save categories & tags" }))
    : loadError
      ? describeApiError(loadError, t({ locale: locale, key: "Failed to load categories & tags" }))
      : null;

  return {
    taxonomies,
    hidden: taxonomiesQuery.status === "success" && taxonomies.length === 0,
    subject: termPickerSubject(props.contentType),
    selected,
    toggle,
    loading: taxonomiesQuery.status === "loading" || assignedQuery.status === "loading",
    dirty,
    saving: saveMutation.status === "pending",
    message,
    error,
    save,
    t: (key) => t({ locale: locale, key: key }),
    canCreate,
    showAddInput,
    showAddTrigger: (taxonomyId) => canCreate && Boolean(groupOf(taxonomyId)) && !showAddInput(taxonomyId),
    setAddOpen,
    newTermName: (taxonomyId) => names[taxonomyId] ?? "",
    setNewTermName,
    onNewTermKeyDown,
    addTerm,
    creating: (taxonomyId) => createTarget === taxonomyId && createMutation.status === "pending",
    createError: (taxonomyId) =>
      createTarget === taxonomyId && createMutation.error
        ? describeApiError(createMutation.error, t({ locale: locale, key: "Failed to create term" }))
        : null,
    suggestions: (taxonomyId) =>
      (groupOf(taxonomyId)?.terms ?? []).filter((term) => !selected.has(term.id)).map((term) => term.name),
  };
}

/**
 * Binds the real `/api/.../taxonomy` list and `{assigned,assign,unassign}-terms` client and the
 * resolved `useAdminLocale()` value — see `term-picker-dependencies.hooks.ts`. The zero-argument-deps
 * half of the `useX(dependencies)` / `useWiredX()` pair, so `TermPicker.tsx` composes this and a
 * test composes {@link useTermPicker} with `createFakeTermPickerPort`.
 */
export function useWiredTermPicker(props: TermPickerTarget): TermPickerController {
  const locale = useAdminLocale();
  return useTermPicker(props, { port: defaultTermPickerPort, locale });
}
