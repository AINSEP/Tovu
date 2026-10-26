/** Shell screens only; admin pageviews already belong to the site's server collector. */
import { useEffect, useRef } from 'react';
import { reportShellTelemetry } from './product-telemetry.js';

/** StrictMode effect replays must not double a screen view. O(1) local state, no timers. */
export function useProductScreen({ screen }: { screen: string | null }, _options = {}): void {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (screen !== null && screen !== previous.current) reportShellTelemetry({ payload: { kind: 'screen', id: screen } });
    previous.current = screen;
  }, [screen]);
}
