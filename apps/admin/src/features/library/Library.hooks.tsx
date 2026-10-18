import type { TabBarTab } from "@jini-ai/ui/tab-strip";
import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { navigate } from "../../lib/router";

/**
 * @file The Library screen's two `?tab=` tabs (Upload, Documents) on the shared
 * `@jini-ai/ui/tab-strip` — same convention as `Roles.hooks.tsx` / `Sites`. Upload is first and
 * the landing tab, in the owner's order (2026-10-18); after an upload the tab offers
 * "View in Documents".
 */

const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function UploadIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15" />
    </svg>
  );
}

export function DocumentsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...LINE_ICON} width={size} height={size}>
      <path d="M7 3.5h7l4 4V19a1.5 1.5 0 01-1.5 1.5h-9.5A1.5 1.5 0 015.5 19V5A1.5 1.5 0 017 3.5z" />
      <path d="M14 3.5V8h4M9 12.5h6M9 16h4" />
    </svg>
  );
}

export const LIBRARY_TAB_IDS = ["upload", "documents"] as const;
export type LibraryTabId = (typeof LIBRARY_TAB_IDS)[number];

export function resolveLibraryTabId(tabId: string | null | undefined): LibraryTabId {
  return resolveActiveTabId({ tabId: tabId, validIds: LIBRARY_TAB_IDS, defaultId: "upload" });
}

export function resolveLibraryTabs(t: (key: string) => string, { documentCount }: { documentCount?: number } = {}): TabBarTab[] {
  return [
    {
      id: "upload",
      label: t("Upload"),
      icon: <UploadIcon />,
      handle: "library-tab-upload",
      handleLabel: "Switch to the Upload tab — add Markdown, text, PDF, Word, CSV or JSON documents to the Library",
    },
    {
      id: "documents",
      label: t("Documents"),
      icon: <DocumentsIcon />,
      count: documentCount,
      handle: "library-tab-documents",
      handleLabel: "Switch to the Documents tab — preview, rename, download or move Library documents to Trash",
    },
  ];
}

export function goToLibraryTab(tabId: string) {
  navigate(`/library?tab=${tabId}`, { replace: true });
}
