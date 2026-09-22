import { useEffect, useRef, useState } from "react";

import type { AdminFormDefinition, AdminFormField, AdminFormNotify } from "@/lib/api";
import { useFetchMutation, useFetchQuery } from "@/lib/fetch-query";
import { navigate as defaultNavigate } from "@/lib/router";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { FORM_TABS, KEYS, blankField, existingFieldIdsOf, nextTabIndex, parseRecipients, visibleFormEditorError } from "../rules";
import { t as translate } from "../forms-i18n";
import { defaultFormsPort } from "./forms-dependencies.hooks";
import type { FormsPort } from "./forms-port.hooks";

/**
 * @file Everything the FormEditor SCREEN does — load, save, status toggle, and the Fields/
 * Submissions tab strip's roving-tabindex focus management — so `FormEditor`'s exported component
 * in `FormEditor.tsx` is only markup.
 *
 * Extracted verbatim — same load effect, same save/status-toggle error strings, same "later failure
 * keeps the editor on screen" guard (the audit-blocker fix this screen's file header describes —
 * see `FormEditor.tsx`'s own header for the full rationale, which stays with the guard in the view
 * since it describes render behaviour, not this hook's state).
 *
 * `tab` (ADR-063, 2026-08-31): no longer local state — it is `props.tab`, derived from the route
 * (`/forms/:formId` vs `/forms/:formId/submissions`) by `panels.tsx`/`FormEditor.tsx`. Switching
 * tabs calls the injected `navigate` (real app router), the same idiom `Deployment.tsx`'s tab strip
 * uses, rather than a local `setTab` — Submissions has its own independent fetch, so a tab switch
 * is a genuine route change, not a display-layer filter over data already in hand.
 *
 * `tabRefs` moves here too, per Pattern 1 (every `useRef` moves with state/effects, not just
 * `useState`) — the view still attaches each button via its own `ref` callback (an unavoidably
 * DOM-side operation), but the ref array itself and the keydown-to-focus-change logic
 * (`onTabsKeyDown`) are behaviour, not markup.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because
 * nothing outside `features/forms` needs it.
 *
 * `port`/`navigate` are injected — see `forms-port.hooks.ts` (shared with `use-forms-list.hooks.ts`,
 * since both read/write the same `AdminFormDefinition` resource) — rather than reaching `lib/api`/
 * `lib/router` directly, so a test can describe load/save outcomes against `createFakeFormsPort`
 * instead of stubbing global `fetch`. `useWiredFormEditor` below is the zero-argument pair
 * `FormEditor.tsx` actually mounts.
 *
 * `t` (standing i18n rule — a component with a hook gets a BOUND `t` from that hook, not its own
 * `useAdminLocale()`/dictionary import, same shape `use-post-editor.hooks.ts` established for this
 * conversion): injected alongside `port`/`navigate` because `FormEditor.tsx` itself (the copy
 * around this hook's own state — tab labels, Save button, etc.) DOES need translated strings, even
 * though this hook's own error messages don't. Pre-bound to `(key: string) => string`.
 * `useAdminLocale()` and `FORMS_DICT` are called/read only inside {@link useWiredFormEditor}.
 *
 * `lib/fetch-query` migration (2026-08-12): the load is one `useFetchQuery` keyed on
 * `KEYS.form(formId)` (disabled for `isNew`, matching the original `if (isNew) return;` early-out).
 * `form`/`name`/`slug`/`fields`/`notify`/`recipientsText` stay local `useState` — the operator edits
 * them — and are seeded from `list.data` exactly once per `formId` via `seededFormIdRef`, the same
 * shape `collections/hooks/use-collection-entry-editor.hooks.ts`'s `seededIdentityRef` establishes
 * (see that file's header for the regression it guards against: a background refetch of the SAME
 * identity must not clobber in-progress edits). `handleSave`/`handleStatusToggle` set `form` (and,
 * for save, the rest of the seeded fields) directly from each MUTATION's own response, and neither
 * mutation invalidates this hook's OWN `KEYS.form(formId)` read (only the sibling `KEYS.list`) —
 * mirroring `save()`/`toggleLifecycle()` in that same collections hook, which invalidate only the
 * sibling `KEYS.entries(...)`, never their own `KEYS.entry(...)`, for the identical reason: a
 * response already in hand needs no redundant background refetch of itself. This eliminates the
 * load race an external audit flagged at this file's old line 117 (`useEffect(load, [props.formId,
 * port])` with no cancellation guard, so a formId change mid-flight could commit a stale response):
 * a keyed query cannot commit a response belonging to a prior key, by construction.
 */

export interface FormEditorController {
  isNew: boolean;
  /** `null` until the initial load settles (or always, for `isNew`) — the caller renders a loading
   *  state or the empty create form accordingly. */
  form: AdminFormDefinition | null;
  name: string;
  setName: (value: string) => void;
  slug: string;
  setSlug: (value: string) => void;
  fields: AdminFormField[];
  setFields: (fields: AdminFormField[]) => void;
  notify: AdminFormNotify;
  setNotify: (notify: AdminFormNotify) => void;
  recipientsText: string;
  setRecipientsText: (value: string) => void;
  tab: "fields" | "submissions";
  /** Navigates to this form's Fields or Submissions route — real `navigate()`, not local state
   *  (ADR-063: Submissions has its own independent fetch, so a tab switch is a genuine route
   *  change, the same idiom `Deployment.tsx`'s tab strip uses). Pushes a history entry (no
   *  `replace`) so browser back/forward move naturally between the two routes, unlike the
   *  `?tab=` screens' `replace: true` view-filter switches. */
  onTabChange: (tab: "fields" | "submissions") => void;
  error: string | null;
  saving: boolean;
  /** Already-persisted field ids on the loaded form — see `existingFieldIdsOf`. */
  existingFieldIds: string[];
  /** Tabs render only for an existing, loaded form — never for `isNew`, and never before `form`
   *  has loaded. */
  showTabs: boolean;
  /** Per-tab-button refs, indexed the same as `FORM_TABS` — attach via each button's own `ref`
   *  callback in the view. */
  tabRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  /** Roving-tabindex keydown handler for the tablist `<div>` — ArrowLeft/ArrowRight/Home/End move
   *  both the selected tab and DOM focus together. */
  onTabsKeyDown: (e: React.KeyboardEvent) => void;
  handleSave: () => void;
  handleStatusToggle: () => void;
  /** Bound translator — see this file's own header for why it arrives via the hook rather than
   *  `FormEditor.tsx` calling `useAdminLocale()`/`FORMS_DICT` directly. */
  t: (key: string) => string;
}

export function useFormEditor(
  props: { formId: string; tab: "fields" | "submissions" },
  deps: { port: FormsPort; navigate: (path: string) => void; t: (key: string) => string }
): FormEditorController {
  const { port, navigate, t } = deps;
  const { tab } = props;
  const isNew = props.formId === "new";
  const [form, setForm] = useState<AdminFormDefinition | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [fields, setFields] = useState<AdminFormField[]>([blankField()]);
  const [notify, setNotify] = useState<AdminFormNotify>({ enabled: false, recipients: [] });
  const [recipientsText, setRecipientsText] = useState("");
  // Roving-tabindex focus targets for the tab strip below, indexed the same as `FORM_TABS` — see
  // `nextTabIndex`'s doc comment for why the index math itself lives outside the component.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const list = useFetchQuery({ key: KEYS.form(props.formId), fetch: () => port.getForm(props.formId), enabled: !isNew });

  // Seeds `form`/`name`/`slug`/`fields`/`notify`/`recipientsText` from `list.data` exactly once per
  // `formId` — see this file's own header for the regression this guards against (a background
  // refetch of the SAME formId must not clobber in-progress edits).
  const seededFormIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (seededFormIdRef.current !== props.formId) seededFormIdRef.current = null;
    if (isNew || list.status === "loading" || !list.data) return;
    if (seededFormIdRef.current === props.formId) return;
    seededFormIdRef.current = props.formId;

    const loaded = list.data.data;
    setForm(loaded);
    setName(loaded.name);
    setSlug(loaded.slug);
    setFields(loaded.fields);
    setNotify(loaded.notify);
    setRecipientsText(loaded.notify.recipients.join(", "));
  }, [props.formId, isNew, list.status, list.data]);

  // None of these invalidate `KEYS.form(props.formId)` — only `KEYS.list`. `handleSave`/
  // `handleStatusToggle` below already set `form` (and, for save, the rest of the seeded fields)
  // directly from each mutation's own response, so invalidating this hook's OWN read key would only
  // buy a redundant background refetch of data already in hand — the same reasoning
  // `use-collection-entry-editor.hooks.ts`'s `save()`/`toggleLifecycle()` document for why THEIR
  // `invalidates` names only the sibling `KEYS.entries(...)`, never their own `KEYS.entry(...)`.
  const updateMutation = useFetchMutation({
    run: (input: { name: string; fields: AdminFormField[]; notify: AdminFormNotify }) =>
      // Targets the loaded record's real id, never `props.formId` directly — the admin URL now
      // carries the form's slug when one resolves (ui-fixes-backlog.md #8), so `props.formId` may
      // itself BE that slug. `form.id` is always the real id regardless of which one the URL held,
      // which is what lets the PUT route stay id-only (no matching slug support needed — see
      // `get-by-id.ts`'s own comment on why only the GET route resolves either). The `?? props
      // .formId` fallback only matters if this ever fired before `form` loaded, which it can't:
      // `FormEditor.tsx`'s `!isNew && !form` guards keep the whole editor (Save button included)
      // off-screen until `form` is set.
      port.updateForm({ id: form?.id ?? props.formId }, input),
    invalidates: [KEYS.list],
  });
  const createMutation = useFetchMutation({
    run: (input: { name: string; slug: string; fields: AdminFormField[]; notify: AdminFormNotify }) =>
      port.createForm({ name: input.name, slug: input.slug, fields: input.fields }, { notify: input.notify }),
    invalidates: [KEYS.list],
  });
  const statusMutation = useFetchMutation({
    run: (input: { id: string; status: "active" | "disabled" }) => port.updateForm({ id: input.id }, { status: input.status }),
    invalidates: [KEYS.list],
  });

  async function handleSave() {
    const notifyPayload = { ...notify, recipients: parseRecipients(recipientsText) };
    try {
      if (isNew) {
        const created = await createMutation.mutate({ name, slug, fields, notify: notifyPayload });
        // Slug, not id — see this hook's own file header / `get-by-id.ts` for the id-or-slug
        // resolution this now lands on (ui-fixes-backlog.md #8).
        navigate(`/forms/${created.data.slug}`);
      } else {
        // Set directly from the write's own response — `updateMutation` doesn't invalidate this
        // hook's own `KEYS.form(id)` read (see the mutations' own comment above), so there is no
        // background refetch to wait for or to accidentally clobber an in-progress edit with.
        // Mirrors `use-collection-entry-editor.hooks.ts`'s `save()`.
        const { data: updated } = await updateMutation.mutate({ name, fields, notify: notifyPayload });
        setForm(updated);
        setName(updated.name);
        setSlug(updated.slug);
        setFields(updated.fields);
        setNotify(updated.notify);
        setRecipientsText(updated.notify.recipients.join(", "));
      }
    } catch {
      // already surfaced through updateMutation.error/createMutation.error -> error below
    }
  }

  async function handleStatusToggle() {
    if (!form) return;
    try {
      const { data: updated } = await statusMutation.mutate({
        id: form.id,
        status: form.status === "active" ? "disabled" : "active",
      });
      setForm(updated);
    } catch {
      // already surfaced through statusMutation.error -> error below
    }
  }

  const saving = updateMutation.status === "pending" || createMutation.status === "pending" || statusMutation.status === "pending";
  const error = visibleFormEditorError({
    updateError: updateMutation.error,
    createError: createMutation.error,
    statusError: statusMutation.error,
    listError: list.error,
    hasForm: form !== null,
    saveFallback: t("save failed"),
    statusUpdateFallback: t("status update failed"),
    loadFormFallback: t("failed to load form"),
  });

  // Navigates to `/forms/:formId` or `/forms/:formId/submissions` (ADR-063) — `panels.tsx`'s
  // `forms` panel keys `FormEditor` off `ctx.params.formId` on BOTH routes, so this is a route
  // change, not a remount: in-progress Fields edits survive a trip to Submissions and back.
  function onTabChange(nextTab: "fields" | "submissions") {
    navigate(nextTab === "submissions" ? `/forms/${props.formId}/submissions` : `/forms/${props.formId}`);
  }

  function onTabsKeyDown(e: React.KeyboardEvent) {
    const currentIndex = FORM_TABS.findIndex((t) => t.id === tab);
    const index = nextTabIndex(e.key, currentIndex);
    if (index === null) return;
    e.preventDefault();
    onTabChange(FORM_TABS[index].id);
    tabRefs.current[index]?.focus();
  }

  return {
    isNew,
    form,
    name,
    setName,
    slug,
    setSlug,
    fields,
    setFields,
    notify,
    setNotify,
    recipientsText,
    setRecipientsText,
    tab,
    onTabChange,
    error,
    saving,
    existingFieldIds: existingFieldIdsOf(form),
    showTabs: !isNew && form !== null,
    tabRefs,
    onTabsKeyDown,
    handleSave,
    handleStatusToggle,
    t,
  };
}

/**
 * Binds the real `/api/.../forms` client, `lib/router`'s `navigate`, and a `FORMS_DICT`-bound
 * translator — see `forms-dependencies.hooks.ts`.
 *
 * The zero-argument-deps half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `FormEditor.tsx` composes this and a test composes {@link useFormEditor} with
 * `createFakeFormsPort`, a fake `navigate`, and a fake `t`.
 */
export function useWiredFormEditor(props: { formId: string; tab: "fields" | "submissions" }): FormEditorController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return useFormEditor(props, { port: defaultFormsPort, navigate: defaultNavigate, t });
}
