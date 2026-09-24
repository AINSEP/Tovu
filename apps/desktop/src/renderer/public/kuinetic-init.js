// Starts kUInetic's declarative `data-kui="..."` attribute observer once the vendored
// `kuinetic.js` (loaded just before this file, see index.html) has defined `window.kuinetic`.
// Kept as its own local file rather than an inline <script> in index.html so the renderer's
// Content-Security-Policy can run with a plain `script-src 'self'` — no `'unsafe-inline'`
// exception needed for a two-line bootstrap.
if (window.kuinetic) window.kuinetic.kuinetic({ observe: true }).start();
