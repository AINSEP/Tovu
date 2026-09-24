import { agentHandle } from "@jini-ai/agentic";
import { isUserCollection } from "../../features/collections/rules";
import type { AdminContentType, AdminFormDefinition, AdminMenu, AdminWidgetType, ContentTypeFieldKind } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { interpolate } from "../../lib/template-i18n";
import {
  COLLECTION_DISPLAYABLE_FIELD_KINDS,
  humanizeFieldName,
  useFetchedOptions,
  useRecentEntriesConfig,
  useSocialLinksConfig,
} from "./WidgetConfigFields.hooks";
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
 *
 * ## Agent handles
 *
 * `WidgetConfigFields` itself renders exactly one of the five sub-forms below (never more than
 * one), so its own `agentHandle` prop is just forwarded to whichever type is active — the field
 * names below are then each type's own, appended as `<base>-<field>`:
 *
 * | widget type | fields |
 * |---|---|
 * | `text` | `<base>-body` |
 * | `social-links` | per row `i` (0-based): `<base>-link-<i>-platform`, `<base>-link-<i>-url`, `<base>-link-<i>-remove`; plus `<base>-add` |
 * | `recent-entries` (labeled "Collection list") | `<base>-max-items`, `<base>-collection`, `<base>-sort`, `<base>-layout`, `<base>-columns` (cards layout only), `<base>-field-<fieldName>` per checkbox, `<base>-filter-field`, `<base>-filter-value` (filter row, shown only once a collection is chosen), `<base>-category-term-id` |
 * | `menu` | `<base>-menu-ref` (a real `<select>` — `page.select_option` resolves it) |
 * | `contact-form` | `<base>-form-definition-id` (a real `<select>`), `<base>-success-message` |
 *
 * `social-links` rows are keyed by array INDEX, not a stable id — the one deliberate exception to
 * this workspace's "never an index" list-handle rule (see `@jini-ai/agentic`'s
 * `buildAgentListHandles`). `SocialLink` (`{ platform, url }`) carries no id of its own in the
 * widget's own `configSchema` (`src/widgets/registry.ts`), and inventing one here would mean
 * changing a schema this component does not own, for a value that is re-fetched fresh on every
 * page load anyway — removing a link DOES shift every later row's handle down by one for the rest
 * of THIS editing session, a real but narrow tradeoff against redesigning a persisted schema this
 * component only renders. Every other row/list handle in this app keeps the stable-id rule.
 * `agentHandle` itself is NOT sanitized — the caller's own explicit choice of name, which fails
 * loudly at first render if invalid. Omit it and no `data-agent-*` markup is emitted at all.
 */

function textValue(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : "";
}

/** `text` (`src/widgets/registry.ts` TEXT_REGISTRATION: `{ body: string }`). */
function TextConfigFields(props: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  agentHandle?: string;
  t: Translate;
}) {
  return (
    <div className="widget-config-fields">
      <label htmlFor="widget-field-body">{props.t("Text")}</label>
      <textarea
        id="widget-field-body"
        rows={6}
        value={textValue(props.config, "body")}
        onChange={(e) => props.onChange({ ...props.config, body: e.target.value })}
        {...(props.agentHandle ? agentHandle(`${props.agentHandle}-body`, { role: "field", label: "Text" }) : {})}
      />
    </div>
  );
}

/** `social-links` (SOCIAL_LINKS_REGISTRATION: `{ links: [{platform,url}], max 20 }`). */
function SocialLinksConfigFields(props: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  agentHandle?: string;
  t: Translate;
}) {
  const { links, updateLink, removeLink, addLink } = useSocialLinksConfig(props.config, props.onChange);
  const base = props.agentHandle;
  const { t } = props;

  return (
    <div className="widget-config-fields">
      <p>{t("Social links")}</p>
      {links.map((link, i) => (
        <fieldset key={i} className="widget-config-social-link-row">
          <legend>{interpolate(t("Link {n}"), { n: i + 1 })}</legend>
          <label htmlFor={`widget-social-platform-${i}`}>{t("Platform")}</label>
          <input
            id={`widget-social-platform-${i}`}
            value={link.platform}
            onChange={(e) => updateLink(i, { platform: e.target.value })}
            placeholder={t("e.g. GitHub")}
            {...(base ? agentHandle(`${base}-link-${i}-platform`, { role: "field", label: `Link ${i + 1} platform` }) : {})}
          />
          <label htmlFor={`widget-social-url-${i}`}>{t("URL")}</label>
          <input
            id={`widget-social-url-${i}`}
            value={link.url}
            onChange={(e) => updateLink(i, { url: e.target.value })}
            placeholder={t("https://…")}
            {...(base ? agentHandle(`${base}-link-${i}-url`, { role: "field", label: `Link ${i + 1} URL` }) : {})}
          />
          <button
            type="button"
            onClick={() => removeLink(i)}
            {...(base ? agentHandle(`${base}-link-${i}-remove`, { role: "button", label: `Remove link ${i + 1}` }) : {})}
          >
            {t("Remove")}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={addLink}
        disabled={links.length >= 20}
        {...(base ? agentHandle(`${base}-add`, { role: "button", label: "Add a social link" }) : {})}
      >
        {t("Add link")}
      </button>
    </div>
  );
}

/** A displayable field of the chosen collection's content type (never `relation`/`json` — see
 *  `COLLECTION_DISPLAYABLE_FIELD_KINDS`), as the four sub-controls below need it. */
type DisplayableField = AdminContentType["fields"][number];

/** `base ? agentHandle(...) : {}`, factored out so `RecentEntriesConfigFields` (four fields of its
 *  own, on top of its four sub-components) doesn't count one branch per field for this — every
 *  other sub-component in this file still writes the ternary inline, since none of them repeats it
 *  often enough to threaten the complexity ceiling. */
function maybeAgentHandle(base: string | undefined, suffix: string, opts: { role: "field" | "button"; label: string }) {
  return base ? agentHandle(`${base}-${suffix}`, opts) : {};
}

/** `collections?.find((ct) => ct.key === key) ?? null`, pulled out for the same reason as
 *  {@link maybeAgentHandle} — one call site, not two branches, in `RecentEntriesConfigFields`. */
function findContentType(collections: AdminContentType[] | null, key: string): AdminContentType | null {
  if (collections === null) return null;
  return collections.find((ct) => ct.key === key) ?? null;
}

/** A displayable field's name, reduced to what `agentHandle` actually accepts: lowercase letters
 *  and digits joined by single hyphens (`@jini-ai/agentic`'s `HANDLE_PATTERN`). Content-type field
 *  names are operator-chosen and commonly snake_case — `docs_page`, the very field this file's own
 *  `tovu_feature` example collection carries — which `agentHandle` throws on verbatim. Used only
 *  for the handle text; the visible label still goes through {@link humanizeFieldName}. */
function fieldHandleSegment(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** The Collection `<select>` — its own component because the loading/error states from
 *  `useFetchedOptions` (mirrors `MenuConfigFields`) replace the whole field, label included, with
 *  a notice, the same shape `MenuConfigFields`/`ContactFormConfigFields` already use. */
function CollectionSelect(props: {
  collections: AdminContentType[] | null;
  error: string | null;
  value: string;
  onChange: (value: string) => void;
  base?: string;
  t: Translate;
}) {
  if (props.error) return <div className="notice error">{props.error}</div>;
  return (
    <>
      <label htmlFor="widget-field-collection">{props.t("Collection")}</label>
      <select
        id="widget-field-collection"
        value={props.value}
        disabled={!props.collections}
        onChange={(e) => props.onChange(e.target.value)}
        {...(props.base ? agentHandle(`${props.base}-collection`, { role: "field", label: "Collection" }) : {})}
      >
        <option value="">{props.t("All collections")}</option>
        {(props.collections ?? []).map((ct) => (
          <option key={ct.key} value={ct.key}>
            {ct.label}
          </option>
        ))}
      </select>
    </>
  );
}

/** Sort — the three built-in options plus ascending/descending per displayable field (empty
 *  before a collection is chosen, so it degrades to just the built-ins). */
function SortSelect(props: { value: string; fields: readonly DisplayableField[]; onChange: (value: string) => void; base?: string; t: Translate }) {
  return (
    <>
      <label htmlFor="widget-field-sort">{props.t("Sort")}</label>
      <select
        id="widget-field-sort"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        {...(props.base ? agentHandle(`${props.base}-sort`, { role: "field", label: "Sort" }) : {})}
      >
        <option value="">{props.t("Default (recently updated)")}</option>
        <option value="newest">{props.t("Newest first")}</option>
        <option value="oldest">{props.t("Oldest first")}</option>
        <option value="title">{props.t("Title (A–Z)")}</option>
        {props.fields.map((f) => (
          <option key={f.name} value={f.name}>
            {interpolate(props.t("{field} (ascending)"), { field: humanizeFieldName(f.name) })}
          </option>
        ))}
        {props.fields.map((f) => (
          <option key={`-${f.name}`} value={`-${f.name}`}>
            {interpolate(props.t("{field} (descending)"), { field: humanizeFieldName(f.name) })}
          </option>
        ))}
      </select>
    </>
  );
}

/** One checkbox per displayable field of the chosen collection, only rendered once one is chosen
 *  (there is no single field list to check boxes against for "All collections"). */
function FieldsCheckboxes(props: {
  fields: readonly DisplayableField[];
  selected: readonly string[];
  onToggle: (name: string, checked: boolean) => void;
  base?: string;
  t: Translate;
}) {
  return (
    <fieldset className="widget-config-fields-checkboxes">
      <legend>{props.t("Fields to show")}</legend>
      {props.fields.map((f) => (
        <label key={f.name} htmlFor={`widget-field-field-${f.name}`}>
          <input
            id={`widget-field-field-${f.name}`}
            type="checkbox"
            checked={props.selected.includes(f.name)}
            onChange={(e) => props.onToggle(f.name, e.target.checked)}
            {...(props.base ? agentHandle(`${props.base}-field-${fieldHandleSegment(f.name)}`, { role: "field", label: `Show ${f.name}` }) : {})}
          />
          {humanizeFieldName(f.name)}
        </label>
      ))}
    </fieldset>
  );
}

/** The one supported filter row (field + value, plan A1) — the value input only appears once a
 *  field is picked, and its raw text is coerced against that field's own kind (boolean/number). */
function FilterRow(props: {
  fields: readonly DisplayableField[];
  field: string;
  value: string;
  onFieldChange: (name: string) => void;
  onValueChange: (raw: string, kind: ContentTypeFieldKind | undefined) => void;
  base?: string;
  t: Translate;
}) {
  const kind = props.fields.find((f) => f.name === props.field)?.kind;
  return (
    <div className="widget-config-filter-row">
      <label htmlFor="widget-field-filter-field">{props.t("Filter")}</label>
      <select
        id="widget-field-filter-field"
        value={props.field}
        onChange={(e) => props.onFieldChange(e.target.value)}
        {...(props.base ? agentHandle(`${props.base}-filter-field`, { role: "field", label: "Filter field" }) : {})}
      >
        <option value="">{props.t("No filter")}</option>
        {props.fields.map((f) => (
          <option key={f.name} value={f.name}>
            {humanizeFieldName(f.name)}
          </option>
        ))}
      </select>
      {props.field && (
        <>
          <label htmlFor="widget-field-filter-value">{props.t("Filter value")}</label>
          <input
            id="widget-field-filter-value"
            value={props.value}
            placeholder={props.t("Value")}
            onChange={(e) => props.onValueChange(e.target.value, kind)}
            {...(props.base ? agentHandle(`${props.base}-filter-value`, { role: "field", label: "Filter value" }) : {})}
          />
        </>
      )}
    </div>
  );
}

/**
 * `recent-entries` (RECENT_ENTRIES_REGISTRATION), labeled "Collection list" in this UI (R1 renamed
 * the widget's behavior, not its type key — `widgetType`/stored config are unaffected). Fetches
 * the content-type registry itself, the same `useFetchedOptions` seam `MenuConfigFields`/
 * `ContactFormConfigFields` use, filtered to `isUserCollection` (system types never appear here —
 * A2's own rule). All config mutation lives in `useRecentEntriesConfig`
 * (`WidgetConfigFields.hooks.tsx`); the Collection/Sort/Fields/Filter controls each live in their
 * own small component above (this function was over the complexity ceiling as one block) — this
 * function only assembles them.
 *
 * "All collections" (an empty `collection`) keeps today's behavior: every user content type,
 * newest-updated first (D7). Fields/Filter are per-content-type, so both are hidden until a
 * specific collection is chosen — there is no single field list to check boxes against otherwise.
 */
function RecentEntriesConfigFields({
  useFetchedOptions: useOptions = useFetchedOptions,
  t,
  ...props
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  agentHandle?: string;
  t: Translate;
} & FetchedOptionsSeam) {
  const maxItems = typeof props.config.maxItems === "number" ? props.config.maxItems : 5;
  const base = props.agentHandle;
  const { items: collections, error: collectionsError } = useOptions<AdminContentType>(
    () => defaultWidgetConfigFieldsPort.listContentTypes().then((r) => r.items.filter((ct) => isUserCollection(ct.key))),
    t("failed to load collections"),
  );
  const c = useRecentEntriesConfig(props.config, props.onChange);
  const selectedType = findContentType(collections, c.collection);
  const displayableFields = selectedType ? selectedType.fields.filter((f) => COLLECTION_DISPLAYABLE_FIELD_KINDS.has(f.kind)) : [];
  const showFieldsAndFilter = selectedType !== null && displayableFields.length > 0;

  return (
    <div className="widget-config-fields">
      <label htmlFor="widget-field-maxItems">{t("Max items")}</label>
      <input
        id="widget-field-maxItems"
        type="number"
        min={1}
        max={20}
        step={1}
        value={maxItems}
        onChange={(e) => props.onChange({ ...props.config, maxItems: e.target.value === "" ? undefined : Number(e.target.value) })}
        {...maybeAgentHandle(base, "max-items", { role: "field", label: "Max items" })}
      />

      <CollectionSelect collections={collections} error={collectionsError} value={c.collection} onChange={c.setCollection} base={base} t={t} />

      <SortSelect value={c.sort} fields={displayableFields} onChange={c.setSort} base={base} t={t} />

      <label htmlFor="widget-field-layout">{t("Layout")}</label>
      <select
        id="widget-field-layout"
        value={c.layout}
        onChange={(e) => c.setLayout(e.target.value)}
        {...maybeAgentHandle(base, "layout", { role: "field", label: "Layout" })}
      >
        <option value="">{t("Default (cards)")}</option>
        <option value="cards">{t("Cards")}</option>
        <option value="list">{t("List")}</option>
      </select>

      {c.layout !== "list" && (
        <>
          <label htmlFor="widget-field-columns">{t("Columns")}</label>
          <input
            id="widget-field-columns"
            type="number"
            min={1}
            max={6}
            step={1}
            value={c.columns}
            onChange={(e) => c.setColumns(e.target.value)}
            {...maybeAgentHandle(base, "columns", { role: "field", label: "Columns" })}
          />
        </>
      )}

      {showFieldsAndFilter && <FieldsCheckboxes fields={displayableFields} selected={c.fields} onToggle={c.toggleField} base={base} t={t} />}

      {showFieldsAndFilter && (
        <FilterRow fields={displayableFields} field={c.filterField} value={c.filterValue} onFieldChange={c.setFilterField} onValueChange={c.setFilterValue} base={base} t={t} />
      )}

      {/* REQ-32/EC-03: a documented soft reference — plain text input, no taxonomy-term picker exists yet in this admin app. */}
      <label htmlFor="widget-field-categoryTermId">{t("Category term id (optional)")}</label>
      <input
        id="widget-field-categoryTermId"
        value={textValue(props.config, "categoryTermId")}
        onChange={(e) => props.onChange({ ...props.config, categoryTermId: e.target.value || undefined })}
        {...maybeAgentHandle(base, "category-term-id", { role: "field", label: "Category term id" })}
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
  t,
  ...props
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  agentHandle?: string;
  t: Translate;
} & FetchedOptionsSeam) {
  const { items: menus, error } = useOptions<AdminMenu>(
    () => defaultWidgetConfigFieldsPort.listMenus().then((r) => r.menus),
    t("failed to load menus"),
  );

  if (error) return <div className="notice error">{error}</div>;
  if (!menus) return <div className="notice">{t("Loading menus…")}</div>;

  return (
    <div className="widget-config-fields">
      <label htmlFor="widget-field-menuRef">{t("Menu")}</label>
      <select
        id="widget-field-menuRef"
        value={textValue(props.config, "menuRef")}
        onChange={(e) => props.onChange({ ...props.config, menuRef: e.target.value })}
        {...(props.agentHandle
          ? agentHandle(`${props.agentHandle}-menu-ref`, {
              role: "field",
              label: "Menu — set with page.select_option, not click",
            })
          : {})}
      >
        <option value="">{t("Choose a menu…")}</option>
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
  t,
  ...props
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  agentHandle?: string;
  t: Translate;
} & FetchedOptionsSeam) {
  const { items: forms, error } = useOptions<AdminFormDefinition>(
    () => defaultWidgetConfigFieldsPort.listForms().then((r) => r.data),
    t("failed to load forms")
  );

  if (error) return <div className="notice error">{error}</div>;
  if (!forms) return <div className="notice">{t("Loading forms…")}</div>;

  return (
    <div className="widget-config-fields">
      <label htmlFor="widget-field-formDefinitionId">{t("Form")}</label>
      <select
        id="widget-field-formDefinitionId"
        value={textValue(props.config, "formDefinitionId")}
        onChange={(e) => props.onChange({ ...props.config, formDefinitionId: e.target.value })}
        {...(props.agentHandle
          ? agentHandle(`${props.agentHandle}-form-definition-id`, {
              role: "field",
              label: "Form — set with page.select_option, not click",
            })
          : {})}
      >
        <option value="">{t("Choose a form…")}</option>
        {forms.map((form) => (
          <option key={form.id} value={form.id}>
            {form.name} — {form.status}
          </option>
        ))}
      </select>
      <label htmlFor="widget-field-successMessage">{t("Success message (optional)")}</label>
      <input
        id="widget-field-successMessage"
        value={textValue(props.config, "successMessage")}
        onChange={(e) => props.onChange({ ...props.config, successMessage: e.target.value || undefined })}
        {...(props.agentHandle
          ? agentHandle(`${props.agentHandle}-success-message`, { role: "field", label: "Success message" })
          : {})}
      />
    </div>
  );
}

export function WidgetConfigFields(
  props: {
    widgetType: AdminWidgetType;
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
    /** This sub-form's own base handle — see this file's "Agent handles" doc for the per-type
     *  field list. Forwarded as-is to whichever of the five sub-forms below is active; omit to
     *  leave every field untagged. */
    agentHandle?: string;
    /** Translates this component's own per-type static copy (field labels/placeholders, the
     *  `menu`/`contact-form` sub-forms' loading/error/empty-option text) —
     *  `components/shared-components-i18n.ts`'s dictionary. Same optional-with-passthrough-default
     *  convention as `Select.tsx`'s `t` prop: `WidgetConfigFields` has no hook of its own to resolve
     *  a locale from (see this file's header), so its callers bind one — `WidgetPickerDialog.tsx`
     *  reuses its own dialog `t`, `WidgetInstanceEditor.tsx` builds a second `t` off this same
     *  dictionary since its own `t` is bound to `widgets-i18n.ts` instead. Omit (or a test) and every
     *  sub-form renders the English source strings unchanged. */
    t?: Translate;
  } & FetchedOptionsSeam
) {
  const { t = (key: string) => key } = props;
  switch (props.widgetType) {
    case "text":
      return <TextConfigFields config={props.config} onChange={props.onChange} agentHandle={props.agentHandle} t={t} />;
    case "social-links":
      return <SocialLinksConfigFields config={props.config} onChange={props.onChange} agentHandle={props.agentHandle} t={t} />;
    case "recent-entries":
      return (
        <RecentEntriesConfigFields
          config={props.config}
          onChange={props.onChange}
          agentHandle={props.agentHandle}
          useFetchedOptions={props.useFetchedOptions}
          t={t}
        />
      );
    case "menu":
      return (
        <MenuConfigFields
          config={props.config}
          onChange={props.onChange}
          agentHandle={props.agentHandle}
          useFetchedOptions={props.useFetchedOptions}
          t={t}
        />
      );
    case "contact-form":
      return (
        <ContactFormConfigFields
          config={props.config}
          onChange={props.onChange}
          agentHandle={props.agentHandle}
          useFetchedOptions={props.useFetchedOptions}
          t={t}
        />
      );
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
  { value: "recent-entries", label: "Collection list" },
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
