import { useEffect, useRef, useState } from "react";

import type { AdminFormDefinition, AdminFormField, AdminFormNotify } from "../../../lib/api";
import { navigate as defaultNavigate } from "../../../lib/router";
import { FORM_TABS, blankField, existingFieldIdsOf, nextTabIndex, parseRecipients } from "../rules";
import { defaultFormsPort } from "./forms-dependencies.hooks";
import type { FormsPort } from "./forms-port.hooks";

/**
 * @file Everything the FormEditor SCREEN does — load, save, status toggle, and the Fields/
 * Submissions tab strip's roving-tabindex focus management — so `FormEditor`'s exported component
 * in `FormEditor.tsx` is only markup.
 *
 * Extracted verbatim — same nine pieces of state, same load effect, same save/status-toggle error
 * strings, same "later failure keeps the editor on screen" guard (the audit-blocker fix this
 * screen's file header describes — see `FormEditor.tsx`'s own header for the full rationale, which
 * stays with the guard in the view since it describes render behaviour, not this hook's state).
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
 * `FormEditor.tsx` actually mounts. No `t`/`locale` injection here — every message in this file is
 * hardcoded English, unlike `features/pages`' `usePageEditor`; adding locale injection that was
 * never there would be a scope-creeping behavior addition, not a refactor.
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
  setTab: (tab: "fields" | "submissions") => void;
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
}

export function useFormEditor(
  props: { formId: string },
  deps: { port: FormsPort; navigate: (path: string) => void }
): FormEditorController {
  const { port, navigate } = deps;
  const isNew = props.formId === "new";
  const [form, setForm] = useState<AdminFormDefinition | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [fields, setFields] = useState<AdminFormField[]>([blankField()]);
  const [notify, setNotify] = useState<AdminFormNotify>({ enabled: false, recipients: [] });
  const [recipientsText, setRecipientsText] = useState("");
  const [tab, setTab] = useState<"fields" | "submissions">("fields");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Roving-tabindex focus targets for the tab strip below, indexed the same as `FORM_TABS` — see
  // `nextTabIndex`'s doc comment for why the index math itself lives outside the component.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function load() {
    if (isNew) return;
    port
      .getForm(props.formId)
      .then((r) => {
        setForm(r.data);
        setName(r.data.name);
        setSlug(r.data.slug);
        setFields(r.data.fields);
        setNotify(r.data.notify);
        setRecipientsText(r.data.notify.recipients.join(", "));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load form"));
  }

  useEffect(load, [props.formId, port]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const notifyPayload = { ...notify, recipients: parseRecipients(recipientsText) };
    try {
      if (isNew) {
        const created = await port.createForm({ name, slug, fields }, { notify: notifyPayload });
        navigate(`/forms/${created.data.id}`);
      } else {
        await port.updateForm({ id: props.formId }, { name, fields, notify: notifyPayload });
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await port.updateForm({ id: form.id }, { status: form.status === "active" ? "disabled" : "active" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "status update failed");
    } finally {
      setSaving(false);
    }
  }

  function onTabsKeyDown(e: React.KeyboardEvent) {
    const currentIndex = FORM_TABS.findIndex((t) => t.id === tab);
    const index = nextTabIndex(e.key, currentIndex);
    if (index === null) return;
    e.preventDefault();
    setTab(FORM_TABS[index].id);
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
    setTab,
    error,
    saving,
    existingFieldIds: existingFieldIdsOf(form),
    showTabs: !isNew && form !== null,
    tabRefs,
    onTabsKeyDown,
    handleSave,
    handleStatusToggle,
  };
}

/**
 * Binds the real `/api/.../forms` client and `lib/router`'s `navigate` — see
 * `forms-dependencies.hooks.ts`.
 *
 * The zero-argument-deps half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `FormEditor.tsx` composes this and a test composes {@link useFormEditor} with
 * `createFakeFormsPort` and a fake `navigate`.
 */
export function useWiredFormEditor(props: { formId: string }): FormEditorController {
  return useFormEditor(props, { port: defaultFormsPort, navigate: defaultNavigate });
}
