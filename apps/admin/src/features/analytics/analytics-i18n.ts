/**
 * @file Spanish translation for the Analytics screen (`/admin/analytics`) — the raw recent-hits
 * table and its "not a dashboard yet" honesty notice.
 */

import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const ANALYTICS_DICT: Record<string, Record<string, string>> = {
  es: {
    Marketing: "Marketing",
    Analytics: "Analítica",
    "The most recent pageviews and events captured on this site.": "Las vistas de página y eventos más recientes capturados en este sitio.",
    "Raw ingest data only — the most recent hits currently sitting in memory. There is no aggregation/rollup layer yet, so there are no totals, trends, or breakdowns here; that is a later build.":
      "Solo datos de ingesta sin procesar — las visitas más recientes que están actualmente en memoria. Todavía no hay una capa de agregación/resumen, por lo que aquí no hay totales, tendencias ni desgloses; eso llegará en una versión posterior.",
    "No hits recorded yet.": "Aún no se han registrado visitas.",
    "Once the site beacon starts sending traffic, recent hits will appear here.": "Una vez que el beacon del sitio empiece a enviar tráfico, las visitas recientes aparecerán aquí.",
    Path: "Ruta",
    Referrer: "Referente",
    "(direct)": "(directo)",
    "Device / Browser": "Dispositivo / Navegador",
    "event:": "evento:",
    Time: "Hora",
    "Loading recent hits…": "Cargando visitas recientes…",
  },
};

export const t = createDictionaryTranslator(ANALYTICS_DICT);
