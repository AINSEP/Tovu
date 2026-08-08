/**
 * @file Spanish translation for the Appearance/Themes screen (`Appearance.tsx`) — this feature's
 * own dictionary, not the shared `lib/admin-nav-i18n.ts` one, so parallel translation passes over
 * other admin sections can't collide on the same file. Same two-step fallback every other `t()` in
 * this app uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const APPEARANCE_DICT: Record<string, Record<string, string>> = {
  es: {
    Studio: "Estudio",
    Themes: "Temas",
    "The active theme controls what visitors see across the entire public site.":
      "El tema activo controla lo que ven los visitantes en todo el sitio público.",
    "View site ↗": "Ver sitio ↗",
    "Loading themes…": "Cargando temas…",
    Active: "Activo",
    "Activating…": "Activando…",
    Activate: "Activar",
    "The official explainer — a landing page that documents Tovu itself.":
      "El explicador oficial: una página de inicio que documenta Tovu.",
    "A reading-first literary theme — serif type in a single column.":
      "Un tema literario enfocado en la lectura, con tipografía serif en una sola columna.",
    "A bright product-blog — cobalt masthead and a rounded card grid.":
      "Un blog de producto luminoso, con cabecera color cobalto y una cuadrícula de tarjetas redondeadas.",
  },
};

export const t = createDictionaryTranslator(APPEARANCE_DICT);
