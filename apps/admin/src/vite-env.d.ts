/// <reference types="vite/client" />

/** This package's own version, injected at build time by `vite.config.ts`'s
 *  `define` from `apps/admin/package.json`. Consumers should import the
 *  typed re-export in `lib/app-version.ts` rather than this global. */
declare const __TOVU_ADMIN_VERSION__: string;
