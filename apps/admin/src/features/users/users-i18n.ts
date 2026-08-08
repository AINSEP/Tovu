/**
 * @file Spanish translation for the Users screen (`Users.tsx`) — this feature's own dictionary,
 * not the shared `lib/admin-nav-i18n.ts` one, so parallel translation passes over other admin
 * sections can't collide on the same file. Same two-step fallback every other `t()` in this app
 * uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";
import { interpolate } from "../../lib/template-i18n";

const USERS_DICT: Record<string, Record<string, string>> = {
  es: {
  People: "Personas",
  Users: "Usuarios",
  "Operator accounts with access to this admin — assign roles and policies, or disable access.":
    "Cuentas de operador con acceso a este panel de administración: asigna roles y políticas, o desactiva el acceso.",
  "New user": "Nuevo usuario",

  Username: "Nombre de usuario",
  "Email (optional)": "Correo electrónico (opcional)",
  Password: "Contraseña",
  "Create user": "Crear usuario",

  Email: "Correo electrónico",
  "(none)": "(ninguno)",
  "Save email": "Guardar correo",
  "Assign role": "Asignar rol",
  "Select a role…": "Selecciona un rol…",
  "(built-in)": "(integrado)",
  Assign: "Asignar",
  "Attach policy": "Adjuntar política",
  "Select a policy…": "Selecciona una política…",
  Attach: "Adjuntar",

  "Actions for user": "Acciones para el usuario",
  none: "ninguno",

  "No users yet.": "Aún no hay usuarios.",
  "Create your first operator account to get started.": "Crea tu primera cuenta de operador para comenzar.",
  Roles: "Roles",
  Policies: "Políticas",

  "Disable this user?": "¿Desactivar este usuario?",
  "They will not be able to sign in until re-enabled.": "No podrán iniciar sesión hasta que se reactive su cuenta.",
  // rules.ts's userRowMenuItems row-menu labels — outside the original `.tsx`-only pass's scope.
  Manage: "Administrar",

  "Reset password?": "¿Restablecer contraseña?",
  "Set a new password for": "Establece una nueva contraseña para",
  "Every active session for this user will be signed out.":
    "Se cerrará toda sesión activa de este usuario.",
  "New password": "Nueva contraseña",
  "Reset password": "Restablecer contraseña",

  "Loading users…": "Cargando usuarios…",

  // Hook-level notice/error strings (use-users.hooks.ts) — these never got translated during the
  // JSX-only pass since they live in `.hooks.ts` files.
  "failed to load users": "no se pudieron cargar los usuarios",
  "failed to create user": "no se pudo crear el usuario",
  "failed to assign role": "no se pudo asignar el rol",
  "failed to attach policy": "no se pudo adjuntar la política",
  "failed to update email": "no se pudo actualizar el correo electrónico",
  "failed to reset password": "no se pudo restablecer la contraseña",
  "failed to change status": "no se pudo cambiar el estado",
  },
};

export const t = createDictionaryTranslator(USERS_DICT);

const PASSWORD_RESET_NOTICE_TEMPLATE: Record<string, string> = {
  en: 'Password reset for "{username}" — every active session for this user was revoked.',
  es: 'Se restableció la contraseña de "{username}" — se revocó toda sesión activa de este usuario.',
};

/** The reset-password success toast — embeds the user's own (untranslated) `username`
 *  mid-sentence, so it can't be a flat `ES` entry the way `roles-i18n.ts`'s
 *  `roleDeleteBodyParts` etc. handle the same shape. */
export function passwordResetNotice(locale: string, username: string): string {
  return interpolate(PASSWORD_RESET_NOTICE_TEMPLATE[locale] ?? PASSWORD_RESET_NOTICE_TEMPLATE.en, { username });
}
