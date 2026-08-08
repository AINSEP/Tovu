/**
 * @file Spanish translation for the Members screen (`Members.tsx`) — this feature's own
 * dictionary, not the shared `lib/admin-nav-i18n.ts` one, so parallel translation passes over
 * other admin sections can't collide on the same file. Same two-step fallback every other `t()`
 * in this app uses: translated value, else the English source string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const MEMBERS_DICT: Record<string, Record<string, string>> = {
  es: {
    People: "Personas",
    Members: "Miembros",
    "Site visitors who have registered an account — review status, resend a sign-in link, or disable access.":
      "Visitantes del sitio que han registrado una cuenta: revisa el estado, reenvía un enlace de acceso o desactiva el acceso.",
    "Loading members…": "Cargando miembros…",
    "No members yet.": "Aún no hay miembros.",
    "Registered site visitors will show up here.": "Los visitantes del sitio registrados aparecerán aquí.",
    Email: "Correo electrónico",
    Created: "Creado",
    Actions: "Acciones",
    "Actions for member": "Acciones para el miembro",
    "Loading detail…": "Cargando detalle…",
    ID: "ID",
    "Email verified": "Correo verificado",
    "not verified": "no verificado",
    Version: "Versión",
    "Disable this member?": "¿Desactivar este miembro?",
    "They will no longer be able to sign in.": "Ya no podrán iniciar sesión.",
    // rules.ts's memberRowMenuItems row-menu label — outside the original `.tsx`-only pass's scope.
    // Reuses this file's own "enlace de acceso" ("sign-in link") noun phrase from the page
    // description above rather than inventing new wording.
    "Resend sign-in link": "Reenviar enlace de acceso",
    "Member disabled.": "Miembro desactivado.",
    "Failed to disable member.": "No se pudo desactivar al miembro.",
    "Sign-in link sent.": "Enlace de acceso enviado.",
    "Failed to send sign-in link.": "No se pudo enviar el enlace de acceso.",
    "Failed to load member detail.": "No se pudo cargar el detalle del miembro.",
    "failed to load members": "no se pudieron cargar los miembros",
  },
};

export const t = createDictionaryTranslator(MEMBERS_DICT);
