import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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
// mkcert-issued certs (`mkcert -install && mkcert localhost 127.0.0.1 ::1`, output into `.certs/`)
// give locally-trusted TLS with no browser warnings; falls back to plain HTTP/1.1 when a
// contributor hasn't generated one yet, so `npm run dev` still boots instead of crashing.
const certPath = path.resolve(__dirname, ".certs/localhost.pem");
const keyPath = path.resolve(__dirname, ".certs/localhost-key.pem");
const httpsOptions =
  existsSync(certPath) && existsSync(keyPath)
    ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
    : undefined;

export default defineConfig({
  base: "/admin/",
  define: {
    __TOVU_ADMIN_VERSION__: JSON.stringify(adminPackageVersion),
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
      "@tovu/headless": path.resolve(__dirname, "../../src/contracts/headless"),
      // Same cross-runtime precedent as `@tovu/headless` just above, extended to a pure resolver
      // FUNCTION rather than wire-contract types: `theme-layout.ts` has zero `node:fs`/`node:path`
      // imports (see its own file header), so this browser bundle can import the exact same
      // apiVersion-aware path facts the server route uses — 2026-08-19 architecture audit findings
      // 1 & 2, "one shared resolver, not six independent copies that can drift."
      "@tovu/theme-layout": path.resolve(__dirname, "../../src/features/theme/theme-layout.ts"),
    },
  },
  server: {
    https: httpsOptions,
    // The `@jini-ai/*` deps are `file:` links straight into a sibling checkout (ADR-049 Decision
    // 7's temporary state, not the intended published-package boundary — see F1 in the fulldiff
    // audit). Vite resolves symlinks to their real path before checking `fs.allow`, so serving any
    // package asset a browser fetches at runtime (e.g. `RemixIcon`'s `import.meta.url`-relative
    // font/CSS) needs that real path allow-listed too, or Vite 403s it under `/@fs/`.
    fs: { allow: [path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../../Jini")] },
    proxy: {
      "/api": { target: process.env.TOVU_API_URL ?? "http://localhost:3000", changeOrigin: false },
      // `@jini-ai/chat-react`'s runtime picker requests agent icons from this root-relative path
      // (see `src/server/app.ts`'s matching route for why it can't just live under `/admin/`).
      "/agent-icons": { target: process.env.TOVU_API_URL ?? "http://localhost:3000", changeOrigin: false },
      // `theme-static-assets.ts`'s `express.static` mount — a `static`-tier theme's own `css/`/
      // `js/`/`screenshots/` files, requested root-relative by the theme's own rendered HTML and by
      // `Appearance.tsx`'s theme-card preview thumbnail. Without this, those requests 404 against
      // Vite's own dev server (which has never heard of `/theme-assets`) instead of reaching the
      // backend that actually serves them, in production this is a non-issue since one server
      // serves both the built admin SPA and this mount.
      "/theme-assets": { target: process.env.TOVU_API_URL ?? "http://localhost:3000", changeOrigin: false },
      // `server/routes/ops/health.ts`'s `/readyz` — deliberately root-level and unauthenticated
      // (see that route's own doc), read by `lib/api.ts`'s `getAssistantDaemonReadyz` for the
      // "Restart assistant" admin control's live status line. Same reason `/agent-icons` above
      // needs its own proxy entry: a root-relative path that cannot live under `/admin/`, so
      // without this Vite's own dev server 404s it (`The server is configured with a public base
      // URL of /admin/ ...`) instead of reaching the backend that actually serves it. Production
      // is unaffected — one server serves both the built admin SPA and this route there.
      "/readyz": { target: process.env.TOVU_API_URL ?? "http://localhost:3000", changeOrigin: false },
    },
  },
});
