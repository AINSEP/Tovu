Config: `scripts/promises.eslint.config.mjs` — typescript-eslint parser, `projectService: true`, only
`@typescript-eslint/no-floating-promises` + `@typescript-eslint/no-misused-promises` (both default options),
`noInlineConfig: true` so existing `eslint-disable` comments do not hide hits. Each unit is linted from its own
directory with `tsconfigRootDir` = that directory, so the project service picks the nearest `tsconfig.json`.
Files: `git ls-files` `*.ts/*.tsx/*.mts/*.cts` with the scope exclusions (Jini: `src/` only).

- Tovu `apps/website` has no `tsconfig.json` of its own; the project service resolves its files through the
  Tovu root `tsconfig.json` (nearest one up the tree).
- Tovu `apps/desktop` has no `tsconfig.json` (only `tsconfig.{main,preload,renderer,live-verify}.json`), which the
  project service never discovers, so desktop runs with `parserOptions.project` = its
  `tsconfig.main.json`, `tsconfig.preload.json`, `tsconfig.renderer.json` instead (documented deviation).
- Tovu apps resolve `@jini-ai/*` from the published npm copies in their own `node_modules` (with `.d.ts`), so
  `npm run link:jini` was not needed; Jini packages resolve siblings through the workspace build (`pnpm -r build`
  EXIT 0, `raw/jini-build.txt`).
- Tovu `packages/sdk`, `packages/contracts` and `apps/site-chat` were also run (they are in the `apps/`/`packages/`
  scope); `content/` has no in-scope TypeScript (only tests and theme `.js` scripts), so it has no typed-lint unit.
