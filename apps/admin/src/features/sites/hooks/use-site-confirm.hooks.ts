/** Promise-shaped confirmation for `useLocalSites`, rendered by the shared `ConfirmDialog`. */
import { useCallback, useRef, useState } from "react";
import type { ConfirmTone } from "@jini-ai/admin/react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { LOCAL_SITE_CONFIRM_KEYS } from "./use-local-sites.hooks";

export type ConfirmableSiteAction = keyof typeof LOCAL_SITE_CONFIRM_KEYS;

/** Title, confirm label and tone per confirmable action; the body is the controller's own message. */
const SITE_CONFIRM_PRESENTATION: Record<ConfirmableSiteAction, { titleKey: string; confirmKey: string; tone: ConfirmTone }> = {
  trash: { titleKey: "Move site to Trash?", confirmKey: "Move to Trash", tone: "danger" },
  delete: { titleKey: "Delete site permanently?", confirmKey: "Delete permanently", tone: "danger" },
  switch: { titleKey: "Switch to this site now?", confirmKey: "Switch now", tone: "warning" },
};

/**
 * Replaces `window.confirm` with the admin's own modal: `confirm` resolves when the operator answers.
 * A second request while one is open cancels the first, so no caller is left awaiting forever.
 * @param input - Bound translator for the dialog chrome.
 * @returns `confirm` for `useLocalSites`, plus the `ConfirmDialog` props for the open request.
 * @complexity O(1) per request.
 */
export function useSiteConfirm({ t }: { t: Translate }, _optional = {}) {
  const [request, setRequest] = useState<{ message: string; action: ConfirmableSiteAction } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback((message: string, { action }: { action: ConfirmableSiteAction }) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest({ message, action });
    });
  }, []);
  const settle = useCallback((ok: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(ok);
  }, []);
  const presentation = SITE_CONFIRM_PRESENTATION[request?.action ?? "trash"];
  return {
    confirm,
    open: request !== null,
    title: t(presentation.titleKey),
    body: request?.message ?? "",
    confirmLabel: t(presentation.confirmKey),
    tone: presentation.tone,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  };
}
export type SiteConfirmController = ReturnType<typeof useSiteConfirm>;
