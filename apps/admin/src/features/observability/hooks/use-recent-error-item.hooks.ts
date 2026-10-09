import { useCallback, useId, useState } from "react";
import { useCopyToClipboard } from "@jini-ai/ui";

import type { RecentServerErrorsController } from "./use-recent-server-errors.hooks";

/**
 * @file State for ONE row of the Recent errors list: whether its full message is shown, and its
 * Copy button's "Copied" feedback (Jini's `useCopyToClipboard`, the same 1.5s flip every viewer
 * copy button uses). Each row owns its own state, so opening one row never re-renders the rest.
 */

export interface RecentErrorItemDependencies {
  /** The row's paste-ready text (`RecentServerErrorRow.copyText`). */
  copyText: string;
  clipboard: RecentServerErrorsController["clipboard"];
}

export interface RecentErrorItemController {
  expanded: boolean;
  toggle: () => void;
  /** `id` of the detail region, for the toggle's `aria-controls`. */
  detailId: string;
  /** True for a moment after a successful copy. */
  copied: boolean;
  /** Copies the row's text; resolves whether the browser accepted it. */
  copy: () => Promise<boolean>;
}

export function useRecentErrorItem({ copyText, clipboard }: RecentErrorItemDependencies): RecentErrorItemController {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const { copied, copy: copyToClipboard } = useCopyToClipboard(clipboard);

  const toggle = useCallback(() => setExpanded((open) => !open), []);
  const copy = useCallback(() => copyToClipboard(copyText), [copyToClipboard, copyText]);

  return { expanded, toggle, detailId, copied, copy };
}
