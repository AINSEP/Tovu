/** Promise-shaped confirmation for `useLocalSites`, rendered by the shared `ConfirmDialog`. */
import { createElement, useCallback, useRef } from "react";
import { useConfirmRequest, type ConfirmTone } from "@jini-ai/admin/react";

import type { LOCAL_SITE_CONFIRM_KEYS } from "./use-local-sites.hooks";

import { type Translate } from '@jini-ai/core/text';
export type ConfirmableSiteAction = keyof typeof LOCAL_SITE_CONFIRM_KEYS;

/** Title, confirm label and tone per confirmable action; the body is the controller's own message. */
const SITE_CONFIRM_PRESENTATION: Record<ConfirmableSiteAction, { titleKey: string; confirmKey: string; tone: ConfirmTone }> = {
  trash: { titleKey: "Move site to Trash?", confirmKey: "Move to Trash", tone: "danger" },
  delete: { titleKey: "Delete site permanently?", confirmKey: "Delete permanently", tone: "danger" },
  switch: { titleKey: "Switch to this site now?", confirmKey: "Switch now", tone: "warning" },
  "stop-serving": { titleKey: "Stop this site?", confirmKey: "Stop", tone: "warning" },
};

/**
 * Replaces `window.confirm` with the admin's own modal: `confirm` resolves when the operator answers.
 * The request lifecycle (a newer request, or unmount, denies the outstanding one; stale answers are
 * ignored) is `useConfirmRequest`'s; this hook only supplies each action's copy and tone.
 * @param input - Bound translator for the dialog chrome.
 * @returns `confirm` for `useLocalSites`, plus the `dialog` props for one always-mounted `ConfirmDialog`.
 * @complexity O(1) per request.
 */
export function useSiteConfirm({ t }: { t: Translate }, _optional = {}) {
  const request = useConfirmRequest({});
  const translate = useRef(t);
  translate.current = t;
  const open = request.confirm;
  const confirm = useCallback(({ message, action }: { message: string; action: ConfirmableSiteAction }, _optional = {}) => {
    const presentation = SITE_CONFIRM_PRESENTATION[action];
    return open({ dialog: {
      title: translate.current(presentation.titleKey),
      body: createElement("p", null, message),
      confirmLabel: translate.current(presentation.confirmKey),
      tone: presentation.tone,
    } });
  }, [open]);
  return { confirm, dialog: request.dialog };
}
export type SiteConfirmController = ReturnType<typeof useSiteConfirm>;
