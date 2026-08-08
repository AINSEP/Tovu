import type { ReactNode } from "react";
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import { interpolate } from "../../lib/template-i18n";

/**
 * @file Spanish translation for the Integrations list (`/admin/integrations`) and its
 * delivery-log sub-screen (`/admin/integrations/:subscriptionId`) — form labels, table headers,
 * empty states, and confirm-dialog copy.
 *
 * Also covers `rules.ts`'s `integrationRowMenuItems` row-menu labels (Pause/Resume/Delete) — the
 * earlier pass's `.tsx`-only scope left these untranslated (flagged in its handoff report as a
 * follow-up gap); `rules.ts` imports `t` from here directly.
 */

const INTEGRATIONS_DICT: Record<string, Record<string, string>> = {
  es: {
    Pause: "Pausar",
    Resume: "Reanudar",
    "Target URL": "URL de destino",
    "Topics (comma-separated, e.g. post.published, post.*)": "Temas (separados por comas, p. ej. post.published, post.*)",
    Create: "Crear",
    "Delete webhook?": "¿Eliminar webhook?",
    Operations: "Operaciones",
    Integrations: "Integraciones",
    "Send webhook notifications to external services when content on this site changes.":
      "Envía notificaciones webhook a servicios externos cuando el contenido de este sitio cambia.",
    "Add webhook": "Agregar webhook",
    "No webhooks yet.": "Aún no hay webhooks.",
    "Add one above to start sending event notifications.": "Agrega uno arriba para empezar a enviar notificaciones de eventos.",
    "Target URL header": "URL de destino",
    "Last delivery": "Última entrega",
    never: "nunca",
    Actions: "Acciones",
    "← Integrations": "← Integraciones",
    "Delivery log": "Registro de entregas",
    "Every delivery attempt logged for this webhook subscription.": "Cada intento de entrega registrado para esta suscripción de webhook.",
    "No deliveries yet for this subscription.": "Aún no hay entregas para esta suscripción.",
    Attempts: "Intentos",
    "Last response": "Última respuesta",
    "Loading delivery log…": "Cargando registro de entregas…",
    "Loading integrations…": "Cargando integraciones…",
  },
};

export const t = createDictionaryTranslator(INTEGRATIONS_DICT);

/** The delete-confirm body embeds the webhook's own label mid-sentence. */
const DELETE_WEBHOOK_FRAGMENTS: Record<string, { before: string; after: string }> = {
  en: { before: 'Delete webhook "', after: '"? This cannot be undone.' },
  es: { before: '¿Eliminar el webhook "', after: '"? Esta acción no se puede deshacer.' },
};

export function deleteWebhookBody(locale: string, label: string): ReactNode {
  const f = DELETE_WEBHOOK_FRAGMENTS[locale] ?? DELETE_WEBHOOK_FRAGMENTS.en;
  return (
    <p>
      {f.before}
      {label}
      {f.after}
    </p>
  );
}

/** The row-menu trigger's accessible name embeds the webhook's own label. */
const ACTIONS_FOR_WEBHOOK_TEMPLATE: Record<string, string> = {
  en: 'Actions for webhook "{label}"',
  es: 'Acciones para el webhook "{label}"',
};

export function actionsForWebhookLabel(locale: string, label: string): string {
  return interpolate(ACTIONS_FOR_WEBHOOK_TEMPLATE[locale] ?? ACTIONS_FOR_WEBHOOK_TEMPLATE.en, { label });
}
