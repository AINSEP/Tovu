import type { AdminFormDefinition, AdminMenu, AdminWidgetType } from "../../lib/api";
import { useFetchedOptions } from "./WidgetConfigFields.hooks";
import { defaultWidgetConfigFieldsPort } from "./widget-config-fields-dependencies.hooks";

/**
 * @file Per-widget-type config sub-forms (`ui.spec.md` §2/§3.4) — one component per v1 widget type,
 * field sets read directly off `src/widgets/registry.ts`'s five `configSchema` records (no field
 * here is invented). Shared between `WidgetInstanceEditor.tsx` (full create/edit form) and
 * `WidgetPickerDialog.tsx` (the "create new" path of the reuse-vs-duplicate picker, REQ-33) so the
 * config-editing UI is defined once, not duplicated per call site.
 *
 * Client-side constraints here (maxItems range, links cap) are UX guidance only — the real
 * validator is server-side (REQ-02); a `WidgetConfigValidationError` must still be handled by the
 * caller even when these constraints appear satisfied (`ui.spec.md` §5/§8).
 *
 * Split into this file (the JSX per widget type) and `WidgetConfigFields.hooks.tsx` (the
 * data-fetching state `MenuConfigFields`/`ContactFormConfigFields` need), per the `@jini-ai/admin`
 * `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern. Unlike `Select`/`WidgetPickerDialog`, there is
 * no single hook this whole exported `WidgetConfigFields` switch renders off of — it dispatches to
 * five independent, unexported per-type sub-components, and only two of them (`MenuConfigFields`,
 * `ContactFormConfigFields`) touch IO at all. The `useFetchedOptions` seam below is threaded through
 * `WidgetConfigFields`'s own props down to those two sub-components (the same
 * `{ useFetchedOptions: useOptions = useFetchedOptions, ...props }` destructure-and-rename shape
 * `RowMenu.tsx` uses for its own `useRowMenu` prop in `@jini-ai/admin`) rather than living on a
 * component-level hook the way `Select`'s `useDropdown`/`WidgetPickerDialog`'s `useDialog` do.
 *
 * The two `fetchList` closures passed into `useFetchedOptions` read through
 * `widget-config-fields-dependencies.hooks.ts`'s `defaultWidgetConfigFieldsPort` rather than
 * `lib/api`'s `api` directly — that file is the only one in this folder that imports `api`. This
 * is a second, NESTED seam underneath the already-reachable `useFetchedOptions` prop (not a new
 * component prop of its own): a test overriding `useFetchedOptions` with a fake never calls the
 * closure at all, so the port is exercised only on the real path, the same "one seam per reachable
 * boundary" reasoning `apps/admin/INFO.md`'s Components section gives for not double-injecting
 * `useWidgetPickerDialog`'s inner `useExistingInstances`.
 */

function textValue(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : "";
}

/** `text` (`src/widgets/registry.ts` TEXT_REGISTRATION: `{ body: string }`). */
function TextConfigFields(props: { config: Record<string, unknown>; onChange: (config: Record<string, unknown>) => void }) {
  return (
    <div className="widget-config-fields">
      <label htmlFor="widget-field-body">Text</label>
      <textarea
        id="widget-field-body"
        rows={6}
        value={textValue(props.config, "body")}
        onChange={(e) => props.onChange({ ...props.config, body: e.target.value })}
      />
    </div>
  );
}

interface SocialLink {
  platform: string;
  url: string;
}

/** `social-links` (SOCIAL_LINKS_REGISTRATION: `{ links: [{platform,url}], max 20 }`). */
function SocialLinksConfigFields(props: { config: Record<string, unknown>; onChange: (config: Record<string, unknown>) => void }) {
  const links: SocialLink[] = Array.isArray(props.config.links) ? (props.config.links as SocialLink[]) : [];

  function updateLink(index: number, patch: Partial<SocialLink>) {
    const next = links.map((l, i) => (i === index ? { ...l, ...patch } : l));
    props.onChange({ ...props.config, links: next });
  }
  function removeLink(index: number) {
    props.onChange({ ...props.config, links: links.filter((_, i) => i !== index) });
  }
  function addLink() {
    if (links.length >= 20) return;
    props.onChange({ ...props.config, links: [...links, { platform: "", url: "" }] });
  }

  return (
    <div className="widget-config-fields">
      <p>Social links</p>
      {links.map((link, i) => (
        <fieldset key={i} className="widget-config-social-link-row">
          <legend>Link {i + 1}</legend>
          <label htmlFor={`widget-social-platform-${i}`}>Platform</label>
          <input
            id={`widget-social-platform-${i}`}
            value={link.platform}
            onChange={(e) => updateLink(i, { platform: e.target.value })}
            placeholder="e.g. GitHub"
          />
          <label htmlFor={`widget-social-url-${i}`}>URL</label>
          <input
            id={`widget-social-url-${i}`}
            value={link.url}
            onChange={(e) => updateLink(i, { url: e.target.value })}
            placeholder="https://…"
          />
          <button type="button" onClick={() => removeLink(i)}>
            Remove
          </button>
        </fieldset>
      ))}
      <button type="button" onClick={addLink} disabled={links.length >= 20}>
        Add link
      </button>
    </div>
  );
}

/** `recent-entries` (RECENT_ENTRIES_REGISTRATION: `{ maxItems: 1-20, categoryTermId? }`). */
function RecentEntriesConfigFields(props: { config: Record<string, unknown>; onChange: (config: Record<string, unknown>) => void }) {
  const maxItems = typeof props.config.maxItems === "number" ? props.config.maxItems : 5;
  return (
    <div className="widget-config-fields">
      <label htmlFor="widget-field-maxItems">Max items</label>
      <input
        id="widget-field-maxItems"
        type="number"
        min={1}
        max={20}
        step={1}
        value={maxItems}
        onChange={(e) => props.onChange({ ...props.config, maxItems: e.target.value === "" ? undefined : Number(e.target.value) })}
      />
      {/* REQ-32/EC-03: a documented soft reference — plain text input, no taxonomy-term picker exists yet in this admin app. */}
      <label htmlFor="widget-field-categoryTermId">Category term id (optional)</label>
      <input
        id="widget-field-categoryTermId"
        value={textValue(props.config, "categoryTermId")}
        onChange={(e) => props.onChange({ ...props.config, categoryTermId: e.target.value || undefined })}
      />
    </div>
  );
}

interface FetchedOptionsSeam {
  /** Injectable seam for this sub-component's data-fetching hook. Defaults to the real
   *  {@link useFetchedOptions}; a test can pass a fake here to exercise rendering without the real
   *  `api.listMenus`/`api.listForms` fetch. */
  useFetchedOptions?: typeof useFetchedOptions;
}

/** `menu` (MENU_REGISTRATION: `{ menuRef: string }`) — dropdown over `api.listMenus()`, mirrors
 * `Seo.tsx`'s `EntryPicker` exactly. */
function MenuConfigFields({
  useFetchedOptions: useOptions = useFetchedOptions,
  ...props
}: { config: Record<string, unknown>; onChange: (config: Record<string, unknown>) => void } & FetchedOptionsSeam) {
  const { items: menus, error } = useOptions<AdminMenu>(
    () => defaultWidgetConfigFieldsPort.listMenus().then((r) => r.menus),
    "failed to load menus",
  );

  if (error) return <div className="notice error">{error}</div>;
  if (!menus) return <div className="notice">Loading menus…</div>;

  return (
    <div className="widget-config-fields">
      <label htmlFor="widget-field-menuRef">Menu</label>
      <select
        id="widget-field-menuRef"
        value={textValue(props.config, "menuRef")}
        onChange={(e) => props.onChange({ ...props.config, menuRef: e.target.value })}
      >
        <option value="">Choose a menu…</option>
        {menus.map((menu) => (
          <option key={menu.id} value={menu.id}>
            {menu.title} ({menu.status})
          </option>
        ))}
      </select>
    </div>
  );
}

/** `contact-form` (CONTACT_FORM_REGISTRATION: `{ formDefinitionId: string, successMessage? }`) —
 * dropdown over `api.listForms()`; each option discloses `status` inline (REQ-38 — an operator
 * shouldn't be surprised later by the disabled-form placeholder render). */
function ContactFormConfigFields({
  useFetchedOptions: useOptions = useFetchedOptions,
  ...props
}: { config: Record<string, unknown>; onChange: (config: Record<string, unknown>) => void } & FetchedOptionsSeam) {
  const { items: forms, error } = useOptions<AdminFormDefinition>(
    () => defaultWidgetConfigFieldsPort.listForms().then((r) => r.data),
    "failed to load forms"
  );

  if (error) return <div className="notice error">{error}</div>;
  if (!forms) return <div className="notice">Loading forms…</div>;

  return (
    <div className="widget-config-fields">
      <label htmlFor="widget-field-formDefinitionId">Form</label>
      <select
        id="widget-field-formDefinitionId"
        value={textValue(props.config, "formDefinitionId")}
        onChange={(e) => props.onChange({ ...props.config, formDefinitionId: e.target.value })}
      >
        <option value="">Choose a form…</option>
        {forms.map((form) => (
          <option key={form.id} value={form.id}>
            {form.name} — {form.status}
          </option>
        ))}
      </select>
      <label htmlFor="widget-field-successMessage">Success message (optional)</label>
      <input
        id="widget-field-successMessage"
        value={textValue(props.config, "successMessage")}
        onChange={(e) => props.onChange({ ...props.config, successMessage: e.target.value || undefined })}
      />
    </div>
  );
}

export function WidgetConfigFields(
  props: {
    widgetType: AdminWidgetType;
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
  } & FetchedOptionsSeam
) {
  switch (props.widgetType) {
    case "text":
      return <TextConfigFields config={props.config} onChange={props.onChange} />;
    case "social-links":
      return <SocialLinksConfigFields config={props.config} onChange={props.onChange} />;
    case "recent-entries":
      return <RecentEntriesConfigFields config={props.config} onChange={props.onChange} />;
    case "menu":
      return <MenuConfigFields config={props.config} onChange={props.onChange} useFetchedOptions={props.useFetchedOptions} />;
    case "contact-form":
      return <ContactFormConfigFields config={props.config} onChange={props.onChange} useFetchedOptions={props.useFetchedOptions} />;
    default:
      return null;
  }
}

/** The five closed v1 type keys (REQ-09) — a client-side constant, mirroring
 * `MenuEditor.tsx`'s equally-closed, equally-hardcoded `AdminMenuTargetKind` `<select>` options; no
 * server round-trip to "list widget types" exists or is needed for v1 (`ui.spec.md` §5). */
export const WIDGET_TYPE_OPTIONS: Array<{ value: AdminWidgetType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "social-links", label: "Social Links" },
  { value: "recent-entries", label: "Recent Entries" },
  { value: "menu", label: "Menu" },
  { value: "contact-form", label: "Contact Form" },
];

/** Default (empty-but-valid-shaped) config per type, for a freshly-opened create form. */
export function defaultWidgetConfig(widgetType: AdminWidgetType): Record<string, unknown> {
  switch (widgetType) {
    case "text":
      return { body: "" };
    case "social-links":
      return { links: [] };
    case "recent-entries":
      return { maxItems: 5 };
    case "menu":
      return { menuRef: "" };
    case "contact-form":
      return { formDefinitionId: "" };
    default:
      return {};
  }
}
