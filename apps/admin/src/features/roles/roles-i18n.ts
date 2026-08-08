/**
 * @file Spanish translation for the Roles & Permissions screen (`Roles.tsx`) — this feature's own
 * dictionary, not the shared `lib/admin-nav-i18n.ts` one, so parallel translation passes over
 * other admin sections can't collide on the same file. Same two-step fallback every other `t()`
 * in this app uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const ROLES_DICT: Record<string, Record<string, string>> = {
  es: {
  People: "Personas",
  "Roles & Permissions": "Roles y permisos",
  "Loading roles & permissions…": "Cargando roles y permisos…",

  Roles: "Roles",
  "Role name": "Nombre del rol",
  "Create role": "Crear rol",
  "No roles yet.": "Aún no hay roles.",
  Type: "Tipo",
  "Built-in": "Integrado",
  Custom: "Personalizado",
  "Actions for role": "Acciones para el rol",
  "Actions for policy": "Acciones para la política",

  Policies: "Políticas",
  "Policy name": "Nombre de la política",
  "Description (optional)": "Descripción (opcional)",
  "Create policy": "Crear política",
  "No policies yet.": "Aún no hay políticas.",
  Description: "Descripción",
  "(frozen)": "(congelada)",

  Permission: "Permiso",
  "resource type (optional)": "tipo de recurso (opcional)",
  Add: "Agregar",

  "Delete role?": "¿Eliminar rol?",
  "Delete policy?": "¿Eliminar política?",

  // rules.ts's roleMenuItems/policyMenuItems row-menu labels — outside the original `.tsx`-only
  // pass's scope, closed here since this dictionary already owns the rest of this screen's
  // vocabulary. "Add permission" composes this file's own established "Add"/"Permission" entries
  // above rather than a fresh phrase.
  Rename: "Renombrar",
  Close: "Cerrar",
  "Add permission": "Agregar permiso",

  // Hook-level notice/error strings (use-roles.hooks.ts) — these never got translated during the
  // JSX-only pass since they live in `.hooks.ts` files.
  "failed to load roles/policies": "no se pudieron cargar los roles y las políticas",
  "failed to create role": "no se pudo crear el rol",
  "failed to create policy": "no se pudo crear la política",
  "failed to rename role": "no se pudo renombrar el rol",
  "failed to delete role": "no se pudo eliminar el rol",
  "failed to update policy": "no se pudo actualizar la política",
  "failed to delete policy": "no se pudo eliminar la política",
  "failed to add permission": "no se pudo agregar el permiso",
  },
};

export const t = createDictionaryTranslator(ROLES_DICT);

/**
 * The page description's prefix/link-label/suffix around the `<a href="/admin/users">` mid-sentence
 * link — split out from `ES` rather than looked up key-by-key, because Spanish puts "pantalla de"
 * (screen) BEFORE the link text while English puts "screen" after it. Concatenating three
 * independently-translated fragments in a fixed English word order would read backwards in Spanish,
 * so this owns the whole sentence shape per locale instead.
 */
const ROLES_DESCRIPTION_PARTS: Record<string, { prefix: string; linkLabel: string; suffix: string }> = {
  en: {
    prefix: "Roles and policies grant access to operator users. Assign a role or policy to a specific user from the ",
    linkLabel: "Users",
    suffix: " screen.",
  },
  es: {
    prefix:
      "Los roles y las políticas otorgan acceso a los usuarios operadores. Asigna un rol o una política a un usuario específico desde la pantalla de ",
    linkLabel: "Usuarios",
    suffix: ".",
  },
};

export function rolesDescriptionParts(locale: string): { prefix: string; linkLabel: string; suffix: string } {
  return ROLES_DESCRIPTION_PARTS[locale] ?? ROLES_DESCRIPTION_PARTS.en;
}

/** The role-delete confirm body's prefix/suffix around the role's own (untranslated) name — same
 *  "own the whole sentence per locale" reasoning as {@link rolesDescriptionParts}: Spanish's leading
 *  "¿" has no English equivalent to concatenate onto. */
const ROLE_DELETE_BODY_PARTS: Record<string, { prefix: string; suffix: string }> = {
  en: { prefix: 'Delete role "', suffix: '"?' },
  es: { prefix: '¿Eliminar el rol "', suffix: '"?' },
};

export function roleDeleteBodyParts(locale: string): { prefix: string; suffix: string } {
  return ROLE_DELETE_BODY_PARTS[locale] ?? ROLE_DELETE_BODY_PARTS.en;
}

/** Same as {@link roleDeleteBodyParts}, for the policy-delete confirm body. */
const POLICY_DELETE_BODY_PARTS: Record<string, { prefix: string; suffix: string }> = {
  en: { prefix: 'Delete policy "', suffix: '"?' },
  es: { prefix: '¿Eliminar la política "', suffix: '"?' },
};

export function policyDeleteBodyParts(locale: string): { prefix: string; suffix: string } {
  return POLICY_DELETE_BODY_PARTS[locale] ?? POLICY_DELETE_BODY_PARTS.en;
}
