/**
 * @file Spanish dictionary for `Collections.tsx` (list + its three modals), `CollectionEntries.tsx`
 * (per-type entry list), and `CollectionEntryEditor.tsx` (entry editor + term picker). Same
 * `DICT[locale]?.[key] ?? key` shape `SettingsUi.tsx`'s own `const t` uses.
 *
 * A few entries are small `{placeholder}` templates rather than pre-split fragments — resolved with
 * a plain `.replace()` at the call site — since the interpolated value (a content-type or entry
 * label) sits in the middle of the Spanish sentence, not always in the same relative position
 * English puts it.
 */
import { interpolate, pickPlural } from "../../lib/template-i18n";

export const COLLECTIONS_DICT: Record<string, Record<string, string>> = {
  es: {
    // Collections.tsx — list
    Content: "Contenido",
    Collections: "Colecciones",
    "Content types you define, each with its own set of entries.":
      "Tipos de contenido que defines, cada uno con su propio conjunto de entradas.",
    "New content type": "Nuevo tipo de contenido",
    Label: "Etiqueta",
    Key: "Clave",
    Fields: "Campos",
    "Queryable fields": "Campos consultables",
    Status: "Estado",
    Entries: "Entradas",
    More: "Más",
    "Manage entries": "Administrar entradas",
    "No Collections yet.": "Aún no hay colecciones.",
    "Create your first content type to start adding entries.":
      "Crea tu primer tipo de contenido para empezar a agregar entradas.",
    // NewContentTypeDialog / EditFieldsDialog (shared field-row copy)
    Field: "Campo",
    Name: "Nombre",
    Kind: "Tipo",
    Required: "Obligatorio",
    "Queryable (adds a database index; keep this list small)":
      "Consultable (agrega un índice a la base de datos; mantén esta lista corta)",
    "Remove field": "Quitar campo",
    "Add field": "Agregar campo",
    "Saving…": "Guardando…",
    "Create content type": "Crear tipo de contenido",
    Cancel: "Cancelar",
    "Edit fields —": "Editar campos —",
    "Save fields": "Guardar campos",
    // rules.ts's contentTypeMenuItems row-menu label — outside the original `.tsx`-only pass's
    // scope; reuses this dictionary's own "Editar campos" wording (the dialog-title variant above
    // just drops the trailing em dash for a short row-menu label).
    "Edit fields": "Editar campos",
    // LifecycleConfirmDialog
    Deprecate: "Marcar obsoleto",
    Tombstone: "Eliminar definitivamente",
    // rules.ts's contentTypeMenuItems row-menu label — outside the original `.tsx`-only pass's scope.
    Reactivate: "Reactivar",
    // CollectionEntries.tsx
    "All \"{label}\" entries in this collection.": "Todas las entradas de \"{label}\" en esta colección.",
    "New entry": "Nueva entrada",
    "No entries yet in {label}.": "Aún no hay entradas en {label}.",
    Title: "Título",
    Updated: "Actualizado",
    // CollectionEntryEditor.tsx
    "Edit {label} entry": "Editar entrada de {label}",
    "New {label} entry": "Nueva entrada de {label}",
    "Update this entry's title, fields, and body.": "Actualiza el título, los campos y el cuerpo de esta entrada.",
    "Entry title": "Título de la entrada",
    Save: "Guardar",
    Publish: "Publicar",
    Unpublish: "Anular publicación",
    "Categories & Tags": "Categorías y etiquetas",
    "Assign existing terms to this entry. This adds assignments — it does not show or remove terms already assigned (no read route exists for that yet).":
      "Asigna términos existentes a esta entrada. Esto agrega asignaciones — no muestra ni quita términos ya asignados (aún no existe una ruta de lectura para eso).",
    "No terms yet.": "Aún no hay términos.",
    "Assigning…": "Asignando…",
    "Assign selected terms": "Asignar términos seleccionados",
    // Hook-level notice/error strings (use-collection-entries.hooks.ts, use-collections.hooks.ts,
    // use-collection-entry-editor.hooks.ts, use-new-content-type-dialog.hooks.ts,
    // use-term-picker.hooks.ts) — these never got translated during the JSX-only pass since they
    // live in `.hooks.ts` files.
    "failed to load entries": "no se pudieron cargar las entradas",
    "failed to load content types": "no se pudieron cargar los tipos de contenido",
    "failed to load entry": "no se pudo cargar la entrada",
    "save failed": "no se pudo guardar",
    "Failed to create content type": "No se pudo crear el tipo de contenido",
    "Failed to assign terms": "No se pudieron asignar los términos",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. Exported so the feature's
 *  `.hooks.ts` files (which have no JSX and build their own `t` closure the way the `.tsx` screens
 *  in this feature do) can call it directly instead of duplicating the
 *  `COLLECTIONS_DICT[locale]?.[key] ?? key` lookup. */
export function t(locale: string, key: string): string {
  return COLLECTIONS_DICT[locale]?.[key] ?? key;
}

const LIFECYCLE_VERB: Record<string, Record<"deprecate" | "reactivate" | "tombstone", string>> = {
  en: { deprecate: "deprecate", reactivate: "reactivate", tombstone: "tombstone" },
  es: { deprecate: "marcar como obsoleto", reactivate: "reactivar", tombstone: "eliminar definitivamente" },
};

const LIFECYCLE_FAILURE_TEMPLATE: Record<string, string> = {
  en: 'Failed to {verb} "{label}"',
  es: 'No se pudo {verb} "{label}"',
};

/** `useCollections`' `runLifecycle` failure message — embeds the raw lifecycle op
 *  ("deprecate"/"reactivate"/"tombstone") and the content type's own (untranslated) `label` mid-
 *  sentence, so it can't be a flat `COLLECTIONS_DICT` entry. Reuses this dictionary's own
 *  Deprecate/Reactivate/Tombstone verb translations rather than inventing new wording. */
export function lifecycleFailureMessage(
  locale: string,
  op: "deprecate" | "reactivate" | "tombstone",
  label: string,
): string {
  const verb = (LIFECYCLE_VERB[locale] ?? LIFECYCLE_VERB.en)[op];
  return interpolate(LIFECYCLE_FAILURE_TEMPLATE[locale] ?? LIFECYCLE_FAILURE_TEMPLATE.en, { verb, label });
}

const ENTRY_LIFECYCLE_FAILURE: Record<string, Record<"publish" | "unpublish", string>> = {
  en: { publish: "Failed to publish entry", unpublish: "Failed to unpublish entry" },
  es: { publish: "No se pudo publicar la entrada", unpublish: "No se pudo anular la publicación de la entrada" },
};

/** `useCollectionEntryEditor`'s `toggleLifecycle` failure message — embeds the raw op
 *  ("publish"/"unpublish"), so it can't be a flat `COLLECTIONS_DICT` entry. Reuses this
 *  dictionary's own Publish/Unpublish verb translations. */
export function entryLifecycleFailureMessage(locale: string, op: "publish" | "unpublish"): string {
  return (ENTRY_LIFECYCLE_FAILURE[locale] ?? ENTRY_LIFECYCLE_FAILURE.en)[op];
}

const ASSIGNED_TERMS_TEMPLATE: Record<string, { one: string; other: string }> = {
  en: { one: "Assigned {count} term(s).", other: "Assigned {count} term(s)." },
  es: { one: "Se asignó {count} término.", other: "Se asignaron {count} términos." },
};

/** `useTermPicker`'s `assign` success message — embeds the assigned-count, with Spanish singular/
 *  plural agreement ("1 término" vs "N términos") the English "term(s)" shorthand doesn't need. */
export function assignedTermsMessage(locale: string, count: number): string {
  const forms = ASSIGNED_TERMS_TEMPLATE[locale] ?? ASSIGNED_TERMS_TEMPLATE.en;
  return interpolate(pickPlural(count, forms), { count });
}
