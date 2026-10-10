import path from "node:path";
import type { Plugin } from "vite";

/**
 * Fails the build loudly if anything in this bundle resolves into `apps/admin`. ADR-054's own
 * "Costs and open risks" section calls this out by name: "an accidental import would ship admin
 * internals to anonymous visitors," and asks for a check rather than relying on review to catch it.
 *
 * Checked in `load()`, not `resolveId()` — `load()` receives the fully RESOLVED absolute file path
 * after alias/relative-path resolution, so this catches every way an import could reach
 * `apps/admin` (a relative `../../admin/...`, a future path alias, a transitive import inside a
 * shared file) rather than only ones that spell "admin" in the import specifier itself.
 */
export const forbidAdminImports: Plugin = {
  name: "tovu:forbid-admin-imports",
  enforce: "pre",
  load(id) {
    if (id.includes(`${path.sep}apps${path.sep}admin${path.sep}`)) {
      throw new Error(
        `tovu:forbid-admin-imports: "${id}" resolves into apps/admin. The public site-chat bundle ` +
          "must not ship admin internals to anonymous visitors (ADR-054) — reuse the shared " +
          "@jini-ai/chat/react components directly instead of importing through apps/admin.",
      );
    }
    return null; // Defer to Vite's normal loader; this plugin only ever vetoes, never supplies content.
  },
};

