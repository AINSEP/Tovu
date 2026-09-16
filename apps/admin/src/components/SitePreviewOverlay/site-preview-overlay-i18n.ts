/**
 * @file Dictionary for `SitePreviewOverlay`'s own three visible strings. Same
 * `DICT[locale]?.[key] ?? key` shape every other `*-i18n.ts` file in this app uses (see
 * `assistant-dock-i18n.ts`) — an unrecognized locale or a missing key falls back to the raw English
 * key, never a blank string.
 *
 * Only a subset of `assistant-dock-i18n.ts`'s locale list is covered so far (es/id/de/zh-CN/zh-TW) —
 * a deliberate, disclosed scope cut for this slice, not an oversight: the fallback makes every other
 * locale read correctly in English rather than break, so widening this list is pure follow-up with
 * no correctness risk today.
 */
export const SITE_PREVIEW_OVERLAY_DICT: Record<string, Record<string, string>> = {
  es: {
    "Site preview": "Vista previa del sitio",
    "Open in browser ↗": "Abrir en el navegador ↗",
    "Close preview": "Cerrar vista previa",
  },
  id: {
    "Site preview": "Pratinjau situs",
    "Open in browser ↗": "Buka di browser ↗",
    "Close preview": "Tutup pratinjau",
  },
  de: {
    "Site preview": "Website-Vorschau",
    "Open in browser ↗": "Im Browser öffnen ↗",
    "Close preview": "Vorschau schließen",
  },
  "zh-CN": {
    "Site preview": "网站预览",
    "Open in browser ↗": "在浏览器中打开 ↗",
    "Close preview": "关闭预览",
  },
  "zh-TW": {
    "Site preview": "網站預覽",
    "Open in browser ↗": "在瀏覽器中開啟 ↗",
    "Close preview": "關閉預覽",
  },
};

/** `DICT[locale]?.[key] ?? key` — see this file's own header. */
export function translateSitePreviewOverlayLabel(locale: string, key: string): string {
  return SITE_PREVIEW_OVERLAY_DICT[locale]?.[key] ?? key;
}
