/**
 * @file Spanish translation for the main admin sidebar — group headings, item labels, and the
 * "Soon" badge — the gap the user flagged twice: `SettingsUi.tsx`'s `I18nProvider` only ever
 * covered the Settings dialog's own tab content, never this persistent nav that's outside it.
 *
 * Deliberately NOT built on `@jini-ai/ui`'s `I18nProvider`/`useT()` mechanism used in
 * `SettingsUi.tsx`: `App.tsx`'s `navGroups` come from `getNav()` → `ADMIN_PANELS`
 * (`panels.tsx`), a plain module-level constant evaluated once at import time, not inside a
 * component render — there is no React tree position to read a context value from at that point.
 * So this translates the already-built `AdminNavGroup[]` output at the point `App.tsx` hands it to
 * `<Sidebar.Nav>`, via a plain lookup function, same "resolve outside React context" shape
 * `SettingsUi.tsx`'s own `const t = (key) => ...` helper already uses and for the same reason.
 *
 * Scope: nav only. Every admin PAGE's own content (headings, buttons, empty states — e.g.
 * `Media.tsx`'s "Upload and manage image and video assets…") is a separate, much larger
 * translation surface, not covered here.
 */
import type { AdminNavGroup } from "@jini-ai/admin/core";
import { createDictionaryTranslator } from "./dictionary-translator";

const ADMIN_NAV_DICT: Record<string, Record<string, string>> = {
  es: {
  // Group headings
  Content: "Contenido",
  People: "Personas",
  Studio: "Estudio",
  Plugins: "Plugins",
  Commerce: "Comercio",
  Operations: "Operaciones",
  Administration: "Administración",
  Marketing: "Marketing",
  // Ungrouped top row
  Overview: "Resumen",
  "AI Assistant": "Asistente de IA",
  // Content
  Pages: "Páginas",
  Posts: "Entradas",
  Media: "Multimedia",
  Collections: "Colecciones",
  Menus: "Menús",
  Widgets: "Widgets",
  "Categories & Tags": "Categorías y etiquetas",
  Forms: "Formularios",
  // People
  Users: "Usuarios",
  Authentication: "Autenticación",
  "Roles & Permissions": "Roles y permisos",
  Members: "Miembros",
  Comments: "Comentarios",
  // Studio
  Themes: "Temas",
  Skills: "Habilidades",
  "Design System": "Sistema de diseño",
  // Plugins
  Installed: "Instalados",
  Marketplace: "Mercado",
  "Agent Plugins": "Plugins de agentes",
  // Commerce
  Payments: "Pagos",
  Orders: "Pedidos",
  Products: "Productos",
  Subscriptions: "Suscripciones",
  Billing: "Facturación",
  // Operations
  Database: "Base de datos",
  "Integrations & API": "Integraciones y API",
  Recovery: "Recuperación",
  "Activity Log": "Registro de actividad",
  "Import & Export": "Importar y exportar",
  Deployment: "Implementación",
  // Administration
  Settings: "Configuración",
  Workspace: "Espacio de trabajo",
  Notifications: "Notificaciones",
  Trash: "Papelera",
  // Marketing
  "SEO & Metadata": "SEO y metadatos",
  Redirects: "Redirecciones",
  Newsletter: "Boletín",
  Analytics: "Analítica",
  // Sidebar chrome
  Soon: "Próximamente",
  },
};

/** Same two-step fallback every other `t()` in this app uses: translated value, else the English
 *  source string itself — never a raw dictionary-miss placeholder. */
export const translateAdminNavLabel = createDictionaryTranslator(ADMIN_NAV_DICT);

/** Applies `translateAdminNavLabel` to every group heading and item label in `getNav()`'s output.
 *  Pure — returns new arrays/objects, doesn't mutate the (possibly cached) input. */
export function translateAdminNavGroups(locale: string, groups: readonly AdminNavGroup[]): AdminNavGroup[] {
  if (locale !== "es") return groups as AdminNavGroup[];
  return groups.map((group) => ({
    ...group,
    label: group.label ? translateAdminNavLabel(locale, group.label) : group.label,
    items: group.items.map((item) => ({
      ...item,
      label: translateAdminNavLabel(locale, item.label),
    })),
  }));
}
