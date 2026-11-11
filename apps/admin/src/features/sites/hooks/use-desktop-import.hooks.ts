import { useCallback, useRef, useState } from "react";
import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import { getImportHandoffPort, type ImportHandoffPort } from "../import-handoff-port";

/**
 * @file "From a live website" inside the desktop app (owner, 2026-11-10): the admin there can't
 * make a site, so it hands off to the app's own Import tab, which does, with the typed address.
 * See `import-handoff-port.ts` for the bridge.
 */

export interface DesktopImportController {
  /** Running inside the desktop app, which can take the hand-off. */
  available: boolean;
  opening: boolean;
  error: string | null;
  /** Opens the app's Import tab; an empty address opens it empty. */
  open: (address: string) => Promise<void>;
}

const NOT_OPENED = "Couldn't open Tovu's Import tab. Open Tovu's home window, then try again.";
const REFUSED = "Couldn't open Tovu's Import tab: {reason}";

/**
 * @param optional.port the desktop's bridge; defaults to `window.tovuImport` (null outside the app).
 * @complexity O(1).
 */
export function useDesktopImport(
  { t }: { t: Translate },
  { port = getImportHandoffPort(undefined) }: { port?: ImportHandoffPort | null } = {},
): DesktopImportController {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not `opening`: a second press can land before React re-renders with the first one.
  const busy = useRef(false);
  const open = useCallback(async (address: string) => {
    if (!port || busy.current) return;
    busy.current = true;
    setOpening(true);
    setError(null);
    const trimmed = address.trim();
    try {
      const { opened } = await port.open(trimmed === "" ? {} : { address: trimmed });
      if (!opened) setError(t(NOT_OPENED));
    } catch (failure) {
      // The app's own reason, verbatim, so it can be pasted into a bug report.
      const reason = failure instanceof Error ? failure.message : String(failure);
      setError(interpolate({ template: t(REFUSED), vars: { reason } }));
    } finally {
      busy.current = false;
      setOpening(false);
    }
  }, [port, t]);
  return { available: port !== null, opening, error, open };
}
