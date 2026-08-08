import type { ReactNode } from "react";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import { interpolate } from "../../lib/template-i18n";

/**
 * @file Spanish translation for the Redirects screen (`/admin/redirects`) — the create form, the
 * bulk-import affordance, table headers, and the delete-confirm dialog.
 *
 * Also covers `rules.ts`'s `redirectRowMenuItems` row-menu labels (Disable/Enable/Delete) — the
 * earlier pass's `.tsx`-only scope left these untranslated (same gap `integrations-i18n.tsx`'s file
 * header documented); `rules.ts` imports `t` from here directly.
 */

const REDIRECTS_DICT: Record<string, Record<string, string>> = {
  es: {
  "Loading…": "Cargando…",
  "Load hits": "Cargar visitas",
  "Bulk import": "Importación masiva",
  "rule objects (1-500 items)": "objetos de regla (1-500 elementos)",
  "Importing…": "Importando…",
  Import: "Importar",
  Marketing: "Marketing",
  Redirects: "Redirecciones",
  "Manual URL redirect rules. Rules created automatically from a slug change (source": "Reglas de redirección de URL manuales. Las reglas creadas automáticamente por un cambio de slug (origen",
  ") also show up here.": ") también aparecen aquí.",
  "Match type": "Tipo de coincidencia",
  "From path": "Ruta de origen",
  "To target": "Destino",
  "Status code": "Código de estado",
  "301 (permanent)": "301 (permanente)",
  "302 (temporary)": "302 (temporal)",
  "307 (temporary, method-preserving)": "307 (temporal, conserva el método)",
  "308 (permanent, method-preserving)": "308 (permanente, conserva el método)",
  "Add redirect": "Agregar redirección",
  "No redirect rules yet.": "Aún no hay reglas de redirección.",
  From: "Desde",
  To: "Hasta",
  Type: "Tipo",
  Code: "Código",
  Source: "Origen",
  Hits: "Visitas",
  "Delete redirect rule?": "¿Eliminar regla de redirección?",
  "Loading redirects…": "Cargando redirecciones…",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. */
export const t = createDictionaryTranslator(REDIRECTS_DICT);

const IMPORT_RULES_LABEL_FRAGMENTS: Record<string, { before: string; after: string }> = {
  en: { before: "Paste a JSON array of ", after: " rule objects (1-500 items)" },
  es: { before: "Pega un arreglo JSON de objetos de regla ", after: " (1-500 elementos)" },
};

/** The bulk-import label sentence embeds the rule-shape `<code>` block mid-sentence. */
export function importRulesLabel(locale: string, shapeCode: ReactNode): ReactNode {
  const f = IMPORT_RULES_LABEL_FRAGMENTS[locale] ?? IMPORT_RULES_LABEL_FRAGMENTS.en;
  return (
    <>
      {f.before}
      {shapeCode}
      {f.after}
    </>
  );
}

const IMPORT_RESULT_SUMMARY_TEMPLATE: Record<string, string> = {
  en: "{created} created, {failed} failed.",
  es: "{created} creadas, {failed} fallidas.",
};

/** The import result summary — "{created} created, {failed} failed." */
export function importResultSummary(locale: string, created: number, failed: number): string {
  return interpolate(IMPORT_RESULT_SUMMARY_TEMPLATE[locale] ?? IMPORT_RESULT_SUMMARY_TEMPLATE.en, {
    created,
    failed,
  });
}

const CREATED_LABEL: Record<string, string> = { en: "Created", es: "Creada" };

/** One created-item line: "Created {fromPattern} → {toTarget}" — "Created" is a status word, not
 *  full-sentence copy, so translated as a short label preceding the arrow. */
export function createdLabel(locale: string): string {
  return CREATED_LABEL[locale] ?? CREATED_LABEL.en;
}

const FAILED_ITEM_LABEL_TEMPLATE: Record<string, string> = {
  en: "Item {index} ({code})",
  es: "Elemento {index} ({code})",
};

/** One failed-item line: "Item {index} ({code})". */
export function failedItemLabel(locale: string, index: number, code: string): string {
  return interpolate(FAILED_ITEM_LABEL_TEMPLATE[locale] ?? FAILED_ITEM_LABEL_TEMPLATE.en, { index, code });
}

const DELETE_REDIRECT_BODY_FRAGMENTS: Record<string, { before: string; after: string }> = {
  en: { before: 'Delete the redirect rule from "', after: '"?' },
  es: { before: '¿Eliminar la regla de redirección desde "', after: '"?' },
};

/** The delete-confirm body embeds the rule's own `fromPattern` mid-sentence. */
export function deleteRedirectBody(locale: string, fromPattern: string): ReactNode {
  const f = DELETE_REDIRECT_BODY_FRAGMENTS[locale] ?? DELETE_REDIRECT_BODY_FRAGMENTS.en;
  return (
    <p>
      {f.before}
      {fromPattern}
      {f.after}
    </p>
  );
}

const ACTIONS_FOR_REDIRECT_TEMPLATE: Record<string, string> = {
  en: 'Actions for redirect rule from "{fromPattern}"',
  es: 'Acciones para la regla de redirección desde "{fromPattern}"',
};

/** The row-menu trigger's accessible name embeds the rule's own `fromPattern`. */
export function actionsForRedirectLabel(locale: string, fromPattern: string): string {
  return interpolate(ACTIONS_FOR_REDIRECT_TEMPLATE[locale] ?? ACTIONS_FOR_REDIRECT_TEMPLATE.en, { fromPattern });
}
