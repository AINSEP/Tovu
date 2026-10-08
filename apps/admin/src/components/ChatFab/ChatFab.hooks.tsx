import { useFabPosition as usePosition } from "@jini-ai/chat/react";
export type { FabPositionResult } from "@jini-ai/chat/react";
/** Must match the FAB CSS; Jini owns fractional persistence and pointer state. */
export const FAB_EDGE_MARGIN = 20;
export function useFabPosition(options: { dockOpen: boolean; avoidBottomPx: number; avoidRightPx?: number }) {
 return usePosition({ ...options, storageKey: "tovu-admin-fab-position",
  storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
  viewport: window, pointerEvents: document, edgeMargin: FAB_EDGE_MARGIN, sizePx: 56, dragThresholdPx: 5,
 }, {});
}
