import type { ReactNode } from "react";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Spanish translation for the Database screen (`/admin/database`) — filter bar, table
 * headers, section headings, button/status labels, and the migrate-forward ceremony copy.
 *
 * Same "resolve outside React context" shape `../../lib/admin-nav-i18n.ts` and
 * `SettingsUi.tsx`'s own `const t` use: a plain lookup fed by the locale this page reads via
 * `loadLanguage()`, not an ambient `I18nProvider` (there is none outside the Settings dialog's own
 * subtree).
 */

const DATABASE_DICT: Record<string, Record<string, string>> = {
  es: {
    Outcome: "Resultado",
    From: "Desde",
    To: "Hasta",
    "(any)": "(cualquiera)",
    "e.g. success": "p. ej. success",
    "Apply filters": "Aplicar filtros",
    "Restore point": "Punto de restauración",
    "View in Recovery →": "Ver en Recuperación →",
    Time: "Hora",
    "No database activity recorded yet.": "Aún no se ha registrado actividad de la base de datos.",
    "Loading…": "Cargando…",
    "Load more": "Cargar más",
    "Loading timeline…": "Cargando cronología…",
    "Restore points": "Puntos de restauración",
    "Create restore point": "Crear punto de restauración",
    "Loading restore points…": "Cargando puntos de restauración…",
    "No restore points yet.": "Aún no hay puntos de restauración.",
    Trigger: "Origen",
    "Cost class": "Clase de costo",
    "Planning…": "Planificando…",
    "Plan migration": "Planificar migración",
    "Confirming…": "Confirmando…",
    "Confirm migration": "Confirmar migración",
    "Confirmed. Executing runs the migration now.": "Confirmado. Ejecutar realiza la migración ahora.",
    "Migrating…": "Migrando…",
    "Execute migration": "Ejecutar migración",
    "Migration executed successfully.": "Migración ejecutada correctamente.",
    "Migrate forward": "Migrar hacia adelante",
    Reset: "Restablecer",
    "Brings this site's schema up to the latest migration, capturing a restore point first when the site's restore-point mechanism allows it.":
      "Actualiza el esquema de este sitio a la última migración, capturando primero un punto de restauración cuando el mecanismo de puntos de restauración del sitio lo permite.",
    Operations: "Operaciones",
    Database: "Base de datos",
    "A read-first record of every migration, snapshot, index change, and template upgrade on this site.":
      "Un registro de solo lectura de cada migración, instantánea, cambio de índice y actualización de plantilla en este sitio.",
    // Hook-level notice/error strings (use-migrate-forward-section.hooks.ts,
    // use-restore-points-section.hooks.ts, use-timeline-section.hooks.ts) — these never got
    // translated during the JSX-only pass since they live in `.hooks.ts` files.
    "Failed to plan the forward migration": "No se pudo planificar la migración hacia adelante",
    "Failed to confirm the forward migration": "No se pudo confirmar la migración hacia adelante",
    "Failed to execute the forward migration": "No se pudo ejecutar la migración hacia adelante",
    "failed to load restore points": "no se pudieron cargar los puntos de restauración",
    "Failed to create restore point": "No se pudo crear el punto de restauración",
    "failed to load the Database Timeline": "no se pudo cargar la cronología de la base de datos",
  },
};

export const t = createDictionaryTranslator(DATABASE_DICT);

/** The "Plan ready" ceremony message embeds `<code>{planId}</code>` mid-sentence, so it can't be a
 *  flat `ES` entry — word order differs by locale, not just the substituted value. */
const PLAN_READY_FRAGMENTS: Record<string, { before: string; after: string }> = {
  en: {
    before: "Plan ready (plan ",
    after: "). Confirming issues a one-time execution token — nothing is migrated yet.",
  },
  es: {
    before: "Plan listo (plan ",
    after: "). Confirmarlo emite un token de ejecución de un solo uso: nada se ha migrado todavía.",
  },
};

export function planReadyMessage(locale: string, planId: string): ReactNode {
  const f = PLAN_READY_FRAGMENTS[locale] ?? PLAN_READY_FRAGMENTS.en;
  return (
    <>
      {f.before}
      <code>{planId}</code>
      {f.after}
    </>
  );
}
