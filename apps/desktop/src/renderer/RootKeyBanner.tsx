import { useEffect, useState } from 'react';

import { runnerInventoryBridge } from './runner-api.js';
import {
  fetchRootKeyStatus,
  rootKeyBannerCopy,
  shouldShowRootKeyBanner,
  type RootKeyStatusView,
} from './root-key-banner.js';
import './root-key-banner.css';

/**
 * @file The shell's "this Tovu has no usable root key" banner.
 *
 * A Tovu launched without `TOVU_INTEGRATIONS_ROOT_KEY` — which is what `electron .` from
 * `apps/desktop` produces, since only `npm run desktop` from the repo root loads `.env` — runs
 * completely normally until the first action that needs a stored credential. On 2026-09-18 that
 * gap cost an afternoon: the real cause sat in a daemon log while an opaque `500 INTERNAL_ERROR`
 * was chased as a network fault. The shell now also logs it at boot, but a log line is exactly
 * what already existed and what nobody read. This is the surface a person looks at.
 *
 * Mounted next to `<App/>` in `main.tsx` rather than inside it: this is an install-level condition,
 * not a feature of any screen, and keeping it out of `App.tsx` means the warning cannot be lost in
 * a future refactor of that tree.
 *
 * Deliberately NOT dismissible. Nothing about the app is blocked while it is up (it is a strip at
 * the top of the window, in normal document flow, and the app is fully usable beneath it), and the
 * condition it reports is a broken install that persists until the app is relaunched correctly. A
 * dismiss control would let one stray click restore exactly the silence this exists to end.
 *
 * All decisions and all copy live in `root-key-banner.ts`, which is directly tested; this file is
 * state plus markup only (this package has no React renderer, so logic here would be untestable).
 */
export function RootKeyBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<RootKeyStatusView>(null);

  useEffect(() => {
    let live = true;
    // `runnerInventoryBridge()` is undefined outside Electron, and `rootKeyStatus` is absent on any
    // preload older than this banner — `fetchRootKeyStatus` resolves `null` for both, and a `null`
    // status renders nothing. A warning that could crash the page would be worse than no warning.
    void fetchRootKeyStatus(runnerInventoryBridge() ?? {}).then((next) => {
      if (live) setStatus(next);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!shouldShowRootKeyBanner(status) || status === null) return null;
  const copy = rootKeyBannerCopy(status);

  return (
    <aside className="root-key-banner" role="alert" data-testid="root-key-banner">
      <div className="root-key-banner__mark" aria-hidden="true">
        !
      </div>
      <div className="root-key-banner__body">
        <h2 className="root-key-banner__headline">{copy.headline}</h2>
        <p className="root-key-banner__cause">{copy.cause}</p>
        <p className="root-key-banner__consequence">{copy.consequence}</p>
        <p className="root-key-banner__fix">
          <code className="root-key-banner__command">{copy.launcherCommand}</code>
          <span className="root-key-banner__hint">{copy.launcherHint}</span>
        </p>
        <ul className="root-key-banner__remedies">
          {copy.remedies.map((remedy) => (
            <li key={remedy}>{remedy}</li>
          ))}
        </ul>
        <p className="root-key-banner__caveat">{copy.caveat}</p>
      </div>
    </aside>
  );
}
