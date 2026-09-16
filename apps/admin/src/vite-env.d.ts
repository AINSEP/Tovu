/// <reference types="vite/client" />

/** This package's own version, injected at build time by `vite.config.ts`'s
 *  `define` from `apps/admin/package.json`. Consumers should import the
 *  typed re-export in `lib/app-version.ts` rather than this global. */
declare const __TOVU_ADMIN_VERSION__: string;

/** The port Vite's own dev server binds, injected at build time by `vite.config.ts`'s `define` from
 *  the same `TOVU_ADMIN_DEV_PORT` expression it passes to `server.port`. Consumers should import the
 *  typed re-export in `lib/admin-dev-origin.ts` rather than this global. */
declare const __TOVU_ADMIN_DEV_PORT__: string;
