/**
 * @file Spanish translation for the SEO & Metadata screen (`/admin/seo`) — the site-wide defaults
 * form, the sitemap action, and the per-entry override panel + analyzer.
 *
 * "SEO" itself is left untranslated in both locales — the acronym is used as-is in Spanish digital
 * marketing/developer usage, matching the brief's "keep the English term if that's what a
 * Spanish-speaking operator would actually expect to see" guidance.
 *
 * Scope note: `agentHandle(...)`'s `label` fields throughout `Seo.tsx` are NOT translated — per
 * `@jini-ai/agentic`'s own source, they compile to `data-agent-label`, internal agent-tooling
 * metadata explicitly documented as "Never live text," not user-visible or screen-reader content.
 */

import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const SEO_DICT: Record<string, Record<string, string>> = {
  es: {
  Entry: "Entrada",
  "Loading entries…": "Cargando entradas…",
  "Choose an entry…": "Elige una entrada…",
  Analysis: "Análisis",
  "Score:": "Puntuación:",
  "No issues.": "Sin problemas.",
  "Per-entry overrides": "Anulaciones por entrada",
  "Fields show the currently-effective value (author override, or site default, or derived from the entry). Only fields you change here are saved as overrides.":
    "Los campos muestran el valor actualmente efectivo (anulación del autor, valor predeterminado del sitio o derivado de la entrada). Solo los campos que cambies aquí se guardan como anulaciones.",
  "Loading entry SEO…": "Cargando SEO de la entrada…",
  Description: "Descripción",
  "Canonical URL": "URL canónica",
  Noindex: "Noindex",
  Nofollow: "Nofollow",
  "OG title": "Título OG",
  "OG description": "Descripción OG",
  "OG image (media ref or URL)": "Imagen OG (referencia de medio o URL)",
  "Twitter title": "Título de Twitter",
  "Twitter description": "Descripción de Twitter",
  "Twitter image (media ref or URL)": "Imagen de Twitter (referencia de medio o URL)",
  "Save overrides": "Guardar anulaciones",
  "Per-entry SEO": "SEO por entrada",
  "Title template (must contain %s)": "Plantilla de título (debe contener %s)",
  "Default meta description": "Meta descripción predeterminada",
  "Default Open Graph / Twitter image (media ref)": "Imagen predeterminada de Open Graph / Twitter (referencia de medio)",
  "Twitter @site handle": "Usuario @site de Twitter",
  "Default noindex": "Noindex predeterminado",
  "Default nofollow": "Nofollow predeterminado",
  "Sitemap enabled": "Mapa del sitio habilitado",
  "Save settings": "Guardar configuración",
  Sitemap: "Mapa del sitio",
  "Force-rebuild the cached sitemap now, bypassing the normal cache-hit path.": "Reconstruye ahora el mapa del sitio en caché, sin pasar por la ruta normal de caché.",
  "Working…": "Procesando…",
  "Regenerate sitemap": "Regenerar mapa del sitio",
  Marketing: "Marketing",
  "Site-wide defaults for meta titles, descriptions, Open Graph/Twitter cards, and robots directives. Per-entry overrides are below.":
    "Valores predeterminados de todo el sitio para meta títulos, descripciones, tarjetas de Open Graph/Twitter y directivas de robots. Las anulaciones por entrada están abajo.",
  "Loading SEO settings…": "Cargando configuración de SEO…",
  "failed to load SEO settings": "no se pudo cargar la configuración de SEO",
  "failed to save SEO settings": "no se pudo guardar la configuración de SEO",
  "Sitemap regeneration accepted.": "Regeneración del mapa del sitio aceptada.",
  "failed to regenerate sitemap": "no se pudo regenerar el mapa del sitio",
  "failed to load entry SEO data": "no se pudieron cargar los datos de SEO de la entrada",
  "failed to save SEO overrides": "no se pudieron guardar las anulaciones de SEO",
  "failed to load entries": "no se pudieron cargar las entradas",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. */
export const t = createDictionaryTranslator(SEO_DICT);
