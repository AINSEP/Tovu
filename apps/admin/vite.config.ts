import { readFileSync } from "node:fs";
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

export default defineConfig({
  base: "/admin/",
  define: {
    __TOVU_ADMIN_VERSION__: JSON.stringify(adminPackageVersion),
  },
  plugins: [redirectBareAdmin, react()],
  resolve: {
    // The `@jini-ai/*` deps are `file:` links into a sibling Jini checkout, and four of them
    // (`admin`, `chat`, `renderers-react`, `ui`) carry their OWN `node_modules/react`. Without
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
      "@tovu/headless": path.resolve(__dirname, "../../src/headless"),
    },
  },
  server: {
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
    },
  },
});
