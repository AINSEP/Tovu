/**
 * @file The three places a site already moves in or out, in the order the Import & Export panel
 * lists them. Each card links to the screen that owns the flow — this panel never re-implements
 * one (export/import live on Sites since the owner placed them there 2026-10-18; static export
 * lives on Deployment). `title`/`lead` are English keys for `import-export-i18n.ts`.
 */
export interface ImportExportLink {
  id: "export" | "import" | "static";
  title: string;
  lead: string;
  href: string;
}

export const IMPORT_EXPORT_LINKS: readonly ImportExportLink[] = [
  { id: "export", title: "Export Site", lead: "A .tovu.zip of this site that another Tovu can import.", href: "/admin/sites?tab=export" },
  { id: "import", title: "Import Site", lead: "Make a new site from a .tovu.zip or share link.", href: "/admin/sites?tab=import" },
  { id: "static", title: "Static Site", lead: "Read-only HTML of the published pages, for any static host.", href: "/admin/deployment?tab=static-site" },
];
