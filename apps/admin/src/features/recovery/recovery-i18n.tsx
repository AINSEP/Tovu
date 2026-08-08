import type { ReactNode } from "react";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Spanish translation for the Recovery screen (`/admin/recovery`) — the restore-points
 * list, the discarded-write-window disclosure, and the plan/confirm/execute restore ceremony.
 *
 * Also covers `rules.ts`'s `categoryLabel` (the discarded-write-window category names) — the
 * earlier pass's `.tsx`-only scope left these untranslated (flagged in its handoff report as a
 * follow-up gap, same as `integrations-i18n.tsx`'s row-menu-label note); `rules.ts` imports `t`
 * from here directly. The untaught-category fallback template ("<category> writes") is built
 * directly in `rules.ts` per locale rather than through this dictionary, since Spanish's
 * "escrituras de <category>" reorders the words rather than substituting one.
 */

const RECOVERY_DICT: Record<string, Record<string, string>> = {
  es: {
  "Go to Database": "Ir a Base de datos",
  // rules.ts's categoryLabel — the two currently-known discarded-write-window categories. Reuses
  // this file's own "escrituras de posts/páginas y de tablas de plugins" wording from the
  // disclosure paragraph below rather than inventing new phrasing.
  "posts/pages writes": "escrituras de posts/páginas",
  "plugin-table rows": "filas de tablas de plugins",
  "Unblock (not yet available)": "Desbloquear (aún no disponible)",
  "No unblock route exists yet — see this screen's file header.":
    "Aún no existe una ruta de desbloqueo — consulta el encabezado del archivo de esta pantalla.",
  "No restore points yet.": "Aún no hay puntos de restauración.",
  Trigger: "Origen",
  "Cost class": "Clase de costo",
  "No restore-point mechanism available — see the runbook.": "No hay mecanismo de puntos de restauración disponible — consulta el runbook.",
  "Restore…": "Restaurar…",
  "This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and is NOT a complete count of everything written since this restore point — change-sets, taxonomy writes, Collections entries, and sessions are not yet counted here.":
    "Esto cubre únicamente las rutas de escritura marcadas con watermark (hoy, escrituras de posts/páginas y de tablas de plugins) y NO es un recuento completo de todo lo escrito desde este punto de restauración — los change-sets, las escrituras de taxonomía, las entradas de Colecciones y las sesiones aún no se cuentan aquí.",
  "I understand this count is partial, not exhaustive, and accept the loss window described above.":
    "Entiendo que este recuento es parcial, no exhaustivo, y acepto la ventana de pérdida descrita anteriormente.",
  "Acknowledge the disclosure above to continue.": "Confirma la divulgación anterior para continuar.",
  "Continue to confirm": "Continuar para confirmar",
  "Planning…": "Planificando…",
  "Confirming…": "Confirmando…",
  "Confirm restore": "Confirmar restauración",
  "Confirmed. Executing performs the restore — this cannot be undone.":
    "Confirmado. Ejecutar realiza la restauración — esta acción no se puede deshacer.",
  "Restoring…": "Restaurando…",
  "Execute restore": "Ejecutar restauración",
  "The database file was replaced — this server process is still serving the pre-restore data from its open connection. Restart the server now to pick up the restored data.":
    "Se reemplazó el archivo de la base de datos — este proceso del servidor todavía sirve los datos previos a la restauración desde su conexión abierta. Reinicia el servidor ahora para aplicar los datos restaurados.",
  "← Restore points": "← Puntos de restauración",
  "Restore to": "Restaurar a",
  "Restore capability:": "Capacidad de restauración:",
  Operations: "Operaciones",
  Recovery: "Recuperación",
  "Restore this site to a previous point in time using a captured restore point.":
    "Restaura este sitio a un punto anterior en el tiempo usando un punto de restauración capturado.",
  "Loading restore points…": "Cargando puntos de restauración…",
  "Computing the discarded-write-window disclosure…": "Calculando la divulgación de la ventana de escritura descartada…",
  // Hook-level notice/error strings (use-recovery.hooks.ts, use-restore-flow.hooks.ts) — these
  // never got translated during the JSX-only pass since they live in `.hooks.ts` files.
  "failed to load Recovery": "no se pudo cargar Recuperación",
  "Failed to compute the discarded-write-window disclosure":
    "No se pudo calcular la divulgación de la ventana de escritura descartada",
  "Failed to plan the restore": "No se pudo planificar la restauración",
  "Failed to confirm the restore": "No se pudo confirmar la restauración",
  "Failed to execute the restore": "No se pudo ejecutar la restauración",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. */
export const t = createDictionaryTranslator(RECOVERY_DICT);

/** "Since <strong>{createdAt}</strong>, restoring here would discard at least:" — the timestamp
 *  is emphasized mid-sentence, so this can't be a flat `ES` entry. */
const SINCE_DISCARD_FRAGMENTS: Record<string, { before: string; after: string }> = {
  en: { before: "Since ", after: ", restoring here would discard at least:" },
  es: { before: "Desde ", after: ", restaurar aquí descartaría al menos:" },
};

export function sinceDiscardMessage(locale: string, createdAt: string): ReactNode {
  const f = SINCE_DISCARD_FRAGMENTS[locale] ?? SINCE_DISCARD_FRAGMENTS.en;
  return (
    <>
      {f.before}
      <strong>{createdAt}</strong>
      {f.after}
    </>
  );
}

/** One discarded-write-window count line — either an exact count or the "unknown" case
 *  (INV-05: never conflate the two). `categoryLabelText` is `rules.ts`'s `categoryLabel()` output,
 *  deliberately still English (see this file's header). */
const UNKNOWN_DISCARD_COUNT_PREFIX: Record<string, string> = {
  en: "at least an unknown number of ",
  es: "al menos una cantidad desconocida de ",
};

export function discardCountLine(locale: string, count: number | "unknown", categoryLabelText: string): ReactNode {
  if (count === "unknown") {
    const prefix = UNKNOWN_DISCARD_COUNT_PREFIX[locale] ?? UNKNOWN_DISCARD_COUNT_PREFIX.en;
    return (
      <span>
        {prefix}
        {categoryLabelText}
      </span>
    );
  }
  return (
    <span>
      {count} {categoryLabelText}
    </span>
  );
}

/** The baseline-unavailable warning names the literal word "unknown" used in the count lines
 *  above, so it's translated as one static block rather than a flat key — keeping both mentions of
 *  "desconocido"/"unknown" in agreement. */
const BASELINE_UNAVAILABLE_TEXT: Record<string, string> = {
  en: 'The discarded-write-window baseline could not be computed for this site right now — every count above is shown as "unknown", not a verified zero.',
  es: 'No se pudo calcular la línea base de la ventana de escritura descartada para este sitio en este momento — cada recuento anterior se muestra como "desconocido", no como un cero verificado.',
};

export function baselineUnavailableMessage(locale: string): ReactNode {
  return <>{BASELINE_UNAVAILABLE_TEXT[locale] ?? BASELINE_UNAVAILABLE_TEXT.en}</>;
}

/** "Restore plan ready (plan <code>{planId}</code>). Confirming issues a one-time execution token
 *  — nothing is restored yet." */
const RESTORE_PLAN_READY_FRAGMENTS: Record<string, { before: string; after: string }> = {
  en: {
    before: "Restore plan ready (plan ",
    after: "). Confirming issues a one-time execution token — nothing is restored yet.",
  },
  es: {
    before: "Plan de restauración listo (plan ",
    after: "). Confirmarlo emite un token de ejecución de un solo uso: nada se ha restaurado todavía.",
  },
};

export function restorePlanReadyMessage(locale: string, planId: string): ReactNode {
  const f = RESTORE_PLAN_READY_FRAGMENTS[locale] ?? RESTORE_PLAN_READY_FRAGMENTS.en;
  return (
    <>
      {f.before}
      <code>{planId}</code>
      {f.after}
    </>
  );
}

/** "Restore run <code>{restoreRunId}</code> finished in state {stateNode}." — `stateNode` is the
 *  caller's own `<span className={status...}>{state}</span>`, passed through rather than rebuilt
 *  here since the status value and its class name are not translatable content. */
const RESTORE_DONE_FRAGMENTS: Record<string, { before: string; middle: string; after: string }> = {
  en: { before: "Restore run ", middle: " finished in state ", after: "." },
  es: { before: "La ejecución de restauración ", middle: " finalizó en estado ", after: "." },
};

export function restoreDoneMessage(locale: string, restoreRunId: string, stateNode: ReactNode): ReactNode {
  const f = RESTORE_DONE_FRAGMENTS[locale] ?? RESTORE_DONE_FRAGMENTS.en;
  return (
    <>
      {f.before}
      <code>{restoreRunId}</code>
      {f.middle}
      {stateNode}
      {f.after}
    </>
  );
}
