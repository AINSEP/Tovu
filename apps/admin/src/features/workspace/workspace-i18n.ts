/**
 * @file Spanish translation for the Workspace admin screen (`/admin/workspace`) — the rename
 * form, the read-only id/created summary, and the disabled delete-workspace notice.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const WORKSPACE_DICT: Record<string, Record<string, string>> = {
  es: {
  Administration: "Administración",
  Workspace: "Espacio de trabajo",
  "This site's identity — its name, URL slug, and creation date.": "La identidad de este sitio — su nombre, slug de URL y fecha de creación.",
  Slug: "Slug",
  "Save changes": "Guardar cambios",
  "Workspace ID": "ID del espacio de trabajo",
  Created: "Creado",
  "Delete workspace": "Eliminar espacio de trabajo",
  "Every Tovu install must always have at least one workspace, so deleting your only workspace is not available. This becomes available once this install supports more than one workspace.":
    "Cada instalación de Tovu debe tener siempre al menos un espacio de trabajo, por lo que eliminar tu único espacio de trabajo no está disponible. Esto estará disponible cuando esta instalación admita más de un espacio de trabajo.",
  "Not available — this install has only one workspace": "No disponible — esta instalación tiene un solo espacio de trabajo",
  "Loading workspace…": "Cargando espacio de trabajo…",
  // Hook-level error strings (use-workspace.hooks.ts) — these never got translated during the
  // JSX-only pass since they live in `.hooks.ts` files.
  "failed to load workspace": "no se pudo cargar el espacio de trabajo",
  "failed to save workspace": "no se pudo guardar el espacio de trabajo",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. */
export const t = createDictionaryTranslator(WORKSPACE_DICT);
