import type { AdminWidgetType } from "@jini-ai/admin/screens/widgets/api/widgets-api.types";

/** The five closed v1 type keys (REQ-09) — a client-side constant, mirroring
 * `MenuEditor.tsx`'s equally-closed, equally-hardcoded `AdminMenuTargetKind` `<select>` options; no
 * server round-trip to "list widget types" exists or is needed for v1 (`ui.spec.md` §5). */
export const WIDGET_TYPE_OPTIONS: Array<{ value: AdminWidgetType; label: string }> = [
  { value: "media", label: "Media" },
  { value: "gallery", label: "Gallery" },
  { value: "text", label: "Text" },
  { value: "social-links", label: "Social Links" },
  { value: "recent-entries", label: "Collection list" },
  { value: "menu", label: "Menu" },
  { value: "contact-form", label: "Contact Form" },
];

/** Default (empty-but-valid-shaped) config per type, for a freshly-opened create form. */
export function defaultWidgetConfig({ widgetType }: { widgetType: AdminWidgetType }, _optional: Record<string, never> = {}): Record<string, unknown> {
  switch (widgetType) {
    case "media":
      return { mode: "media", items: [], layout: "single" };
    case "gallery":
      return { images: [], layout: "grid", columns: 3 };
    case "text":
      return { body: "" };
    case "social-links":
      return { links: [] };
    case "recent-entries":
      return { maxItems: 5 };
    case "menu":
      return { menuRef: "" };
    case "contact-form":
      return { formDefinitionId: "" };
    default:
      return {};
  }
}
