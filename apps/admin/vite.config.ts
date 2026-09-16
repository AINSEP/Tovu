import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { isDevTlsExplicitlyDisabled } from "./dev-tls-disable-flag";

// The admin SPA is served at /admin by the Tovu server in production builds.
// In dev, Vite serves it at :5173 and proxies /api to the backend.

/**
 * This package's own version, read at build time for the About tab.
 *
 * Not a server-reported version: Tovu has no `/api/*` route that exposes an
 * app/build version (the whole `api.ts` surface was checked), and adding one
 * is server-side work outside `apps/admin/**`'s scope. `lib/app-version.ts`
 * labels the resulting constant "Tovu Admin", not "Tovu", so the About panel
 * doesn't claim more precision than a bundle version actually has.
 */
const adminPackageVersion = (
  JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string }
).version;

/**
 * Dev-only: 301 a bare `/admin` to `/admin/`, which `base: "/admin/"` otherwise answers with Vite's
 * own "did you mean to visit /admin/" 404. The real server already does this — `express.static`
 * mounted at `/admin` redirects on its own — so this just stops dev diverging from production.
 */
const redirectBareAdmin: Plugin = {
  name: "tovu:redirect-bare-admin",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== "/admin" && !req.url?.startsWith("/admin?")) return next();
      res.writeHead(301, { Location: `/admin/${req.url.slice("/admin".length)}` });
      res.end();
    });
  },
};

// Chrome caps a plain-HTTP origin at 6 simultaneous connections; the settings SSE feed, the
// assistant-run SSE feed, Vite's own HMR socket, and its ESM module burst all share that budget at
// :5173, so a handful of admin tabs exhausts it and every other request queues silently. HTTP/2
// (available for free once the dev server has TLS) multiplexes all of those over one connection.
// mkcert-issued certs (`mkcert -install && mkcert localhost 127.0.0.1 ::1`, output into the repo
// root's `.certs/`) give locally-trusted TLS with no browser warnings; falls back to plain
// HTTP/1.1 when a contributor hasn't generated one yet, so `npm run dev` still boots instead of
// crashing.
//
// Certs live at the REPO ROOT, not under `apps/admin/`: `apps/website/src/index.ts`'s own API
// server now gates its own TLS the same way (`server/runtime/boot/dev-tls.ts`), reading this exact
// same pair, so one directory serves both dev servers instead of the API reaching across into
// `apps/admin`'s own folder. The toggle is still a single rename, just from the repo root now:
// `mv .certs .certs.disabled` to turn TLS off, `mv .certs.disabled .certs` to turn it back on.
//
// `TOVU_DISABLE_DEV_TLS` is an escape hatch beyond bare file presence: every hermetic Playwright
// `webServer` under `development/*.config.ts` that spawns `npx vite --port <port>` against THIS
// config hardcodes `http://localhost:<port>` for its own readiness probe and `baseURL` — on any
// machine that already has `.certs` (i.e. every contributor's own interactive `npm run dev`
// machine), the bare existsSync gate below would silently flip those hermetic instances to HTTPS
// too and break them. Unset for a normal `npm run dev`, so the default "cert present -> HTTPS"
// contract is unchanged for both `dev.mjs` and a standalone `npm --prefix apps/admin run dev`.
//
// Parsed via `isDevTlsExplicitlyDisabled` (see `dev-tls-disable-flag.ts`), not a bare `Boolean(...)`
// truthy check: the latter treated ANY non-empty string, including the literal `"false"` or `"0"`,
// as "disable" — inverting an operator's explicit `TOVU_DISABLE_DEV_TLS=false` "keep TLS on" intent
// (2026-09-05 audit finding). Mirrors `dev-tls.ts`'s and `dev.mjs`'s own copies of this same parse.
const certPath = path.resolve(__dirname, "../../.certs/localhost.pem");
const keyPath = path.resolve(__dirname, "../../.certs/localhost-key.pem");
const devTlsDisabled = isDevTlsExplicitlyDisabled(process.env.TOVU_DISABLE_DEV_TLS);
const httpsOptions =
  !devTlsDisabled && existsSync(certPath) && existsSync(keyPath)
    ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
    : undefined;
// Mirrors `index.ts`'s own `deriveDevScheme` — the API sibling process shares this exact gate
// (same cert pair, same disable flag), so this is also the correct default scheme for the `/api`
// proxy targets below whenever `TOVU_API_URL` is not explicitly set.
const apiScheme = httpsOptions ? "https" : "http";

/**
 * The port this dev server binds. Hoisted out of `server.port` so the `define` below and the bind
 * itself cannot disagree: `src/lib/admin-dev-origin.ts` compares `window.location.port` against this
 * value to decide whether Vite is serving the document directly or a Tovu server is proxying
 * `/admin/*` to it (`apps/desktop`'s dev-proxy path). Same expression `development/scripts/dev.mjs`
 * and `development/scripts/dev-desktop.mjs` use for their own port preflights.
 */
const adminDevPort = Number(process.env.TOVU_ADMIN_DEV_PORT ?? 5173);

export default defineConfig({
  base: "/admin/",
  define: {
    __TOVU_ADMIN_VERSION__: JSON.stringify(adminPackageVersion),
    __TOVU_ADMIN_DEV_PORT__: JSON.stringify(String(adminDevPort)),
  },
  plugins: [redirectBareAdmin, react()],
  resolve: {
    // The `@jini-ai/*` deps are `file:` links into a sibling Jini checkout, and three of them
    // (`admin`, `chat`, `ui`) carry their OWN `node_modules/react`. Without
    // dedupe the production build embeds one React module instance per copy — measured as five
    // distinct `react.transitional.element` symbol registrations in `dist/assets/index-*.js` —
    // and a component rendered by one instance calls hooks against another instance's null
    // dispatcher: `Cannot read properties of null (reading 'useState')` at first paint.
    //
    // Dev did not show this (Vite's dep pre-bundling collapses them), which is why `/admin/` at
    // :5173 works while the built bundle served at :3000/admin/ throws.
    //
    // Safe because every copy is the same version (19.2.7 across all five, verified) — dedupe
    // picks one instance rather than reconciling different Reacts.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tovu/headless": path.resolve(__dirname, "../website/src/contracts/headless"),
      // Same cross-runtime precedent as `@tovu/headless` just above, extended to a pure resolver
      // FUNCTION rather than wire-contract types: `theme-layout.ts` has zero `node:fs`/`node:path`
      // imports (see its own file header), so this browser bundle can import the exact same
      // apiVersion-aware path facts the server route uses — 2026-08-19 architecture audit findings
      // 1 & 2, "one shared resolver, not six independent copies that can drift."
      "@tovu/theme-layout": path.resolve(__dirname, "../website/src/features/theme/theme-layout.ts"),
    },
  },
  server: {
    https: httpsOptions,
    // Mirrors the `TOVU_API_URL` convention just below: `development/scripts/dev.mjs` computes this
    // port for its own preflight port-collision check and now passes it here too (previously it
    // computed the value but never passed it, and this file never read it, so a second dev stack's
    // admin vite child silently ignored whatever port dev.mjs actually preflight-checked). The
    // `package.json` `dev` script deliberately does NOT hardcode `--port` any more — a CLI flag would
    // outrank this config value, defeating it.
    port: adminDevPort,
    // Without this, a collision on `adminDevPort` makes Vite silently bind the next free port — which
    // `apps/desktop/src/admin-dev-proxy.ts` never probes, so the desktop falls back to whatever
    // `apps/admin/dist` last held with no error anywhere. Failing loudly on `EADDRINUSE` is also what
    // lets `development/scripts/dev-desktop.mjs`'s reuse-or-start race resolve: the loser exits
    // immediately and re-probes instead of drifting onto a port nobody looks at. Every
    // `development/playwright.*.config.ts` already passes `--strictPort` on the CLI (which outranks
    // this file), so none of them change behavior.
    strictPort: true,
    // The `@jini-ai/*` deps are `file:` links straight into a sibling checkout (ADR-049 Decision
    // 7's temporary state, not the intended published-package boundary — see F1 in the fulldiff
    // audit). Vite resolves symlinks to their real path before checking `fs.allow`, so serving any
    // package asset a browser fetches at runtime (e.g. `RemixIcon`'s `import.meta.url`-relative
    // font/CSS) needs that real path allow-listed too, or Vite 403s it under `/@fs/`.
    fs: { allow: [path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../../Jini")] },
    proxy: {
      // `secure: false` on every entry below: when `apiScheme` is `https`, the target is the API's
      // own mkcert-issued cert, which is locally-trusted in the OS/browser trust store (mkcert
      // installs there) but NOT in Node's separate bundled CA list that `http-proxy` verifies
      // against — without this, every proxied request would fail
      // `UNABLE_TO_VERIFY_LEAF_SIGNATURE`/`SELF_SIGNED_CERT_IN_CHAIN` even though the same cert
      // works fine in a real browser tab. Harmless when the target is plain `http://` (unset,
      // ignored by `http-proxy` for non-TLS targets).
      "/api": { target: process.env.TOVU_API_URL ?? `${apiScheme}://localhost:3000`, changeOrigin: false, secure: false },
      // `@jini-ai/chat-react`'s runtime picker requests agent icons from this root-relative path
      // (see `src/server/app.ts`'s matching route for why it can't just live under `/admin/`).
      "/agent-icons": { target: process.env.TOVU_API_URL ?? `${apiScheme}://localhost:3000`, changeOrigin: false, secure: false },
      // `theme-static-assets.ts`'s `express.static` mount — a `static`-tier theme's own `css/`/
      // `js/`/`screenshots/` files, requested root-relative by the theme's own rendered HTML and by
      // `Appearance.tsx`'s theme-card preview thumbnail. Without this, those requests 404 against
      // Vite's own dev server (which has never heard of `/theme-assets`) instead of reaching the
      // backend that actually serves them, in production this is a non-issue since one server
      // serves both the built admin SPA and this mount.
      "/theme-assets": { target: process.env.TOVU_API_URL ?? `${apiScheme}://localhost:3000`, changeOrigin: false, secure: false },
      // `server/routes/ops/health.ts`'s `/readyz` — deliberately root-level and unauthenticated
      // (see that route's own doc), read by `lib/api.ts`'s `getAssistantDaemonReadyz` for the
      // "Restart assistant" admin control's live status line. Same reason `/agent-icons` above
      // needs its own proxy entry: a root-relative path that cannot live under `/admin/`, so
      // without this Vite's own dev server 404s it (`The server is configured with a public base
      // URL of /admin/ ...`) instead of reaching the backend that actually serves it. Production
      // is unaffected — one server serves both the built admin SPA and this route there.
      "/readyz": { target: process.env.TOVU_API_URL ?? `${apiScheme}://localhost:3000`, changeOrigin: false, secure: false },
      // `mcp-ui-sandbox-proxy-route.ts`'s `/mcp-ui/sandbox-proxy.html` — `AssistantDock.tsx` builds
      // its `sandboxProxyUrl` against `location.origin`, root-relative, for the same reason
      // `/agent-icons` above is: the iframe `@mcp-ui/client`'s `AppFrame` navigates to needs a URL
      // that resolves the same way no matter which page embedded the dock, so it cannot live under
      // `/admin/`. Without this entry Vite 404s it with the same "did you mean to visit
      // /admin/mcp-ui/sandbox-proxy.html instead?" base-URL error every MCP-UI surface hit before
      // this fix. Production is unaffected — one server serves both the built admin SPA and this
      // route there.
      "/mcp-ui": { target: process.env.TOVU_API_URL ?? `${apiScheme}://localhost:3000`, changeOrigin: false, secure: false },
    },
  },
});
