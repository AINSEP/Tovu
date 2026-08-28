import { fileURLToPath } from "node:url";

// Minimal config for the real-bundler falsification probe (astro-real-bundler-conformance.test.ts).
// `output: "static"` is Astro's plain SSG mode -- no server, no adapter -- the closest match to what
// Tovu's `static` tier expects a theme's build to have already produced before Tovu ever sees it.
export default {
  output: "static",
  vite: {
    resolve: {
      // Astro's own internal server-island prerender machinery (loaded even in pure `output: "static"`
      // mode) imports `cookie`'s v2 named exports (`parseCookie`/`stringifySetCookie`). This monorepo's
      // ROOT node_modules already hoists an OLDER, incompatible `cookie@0.7.2` (Express's dependency,
      // via the Jini workspace) that has neither export. Because this fixture sits deep inside the host
      // repo with no node_modules of its own, Vite's SSR module resolution for a bare `"cookie"`
      // specifier walks up from the fixture's own directory and hits the wrong hoisted copy before ever
      // reaching astro's correctly-versioned nested one -- verified: `astro build` fails at this import
      // with "Named export 'parseCookie' not found" until this alias pins it explicitly. Scoped to this
      // one fixture's own build only; does not touch the rest of the repo's dependency resolution.
      alias: {
        cookie: fileURLToPath(new URL("../../../../../../../../node_modules/astro/node_modules/cookie", import.meta.url)),
      },
    },
  },
};
