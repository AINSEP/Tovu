// Standalone typed-lint config for the SEC quality audit (report only).
// Only two rules: @typescript-eslint/no-floating-promises + no-misused-promises.
// Inline config is off (eslint-disable comments are ignored) so suppressed hits still count.
//
// Env:
//   SEC_TOOLS   dir whose node_modules holds the pinned eslint/typescript-eslint/typescript
//   SEC_ROOT    the unit root (tsconfigRootDir)
//   SEC_PROJECT optional comma-separated tsconfig paths; when set, uses `project` instead of
//               `projectService` (for units with no tsconfig.json, e.g. apps/desktop).
import { createRequire } from 'node:module';
import path from 'node:path';

const req = createRequire(path.join(process.env.SEC_TOOLS, 'package.json'));
const tseslint = req('typescript-eslint');

const root = process.env.SEC_ROOT ?? process.cwd();
const project = process.env.SEC_PROJECT
  ? { project: process.env.SEC_PROJECT.split(',').map((p) => path.resolve(root, p)) }
  : { projectService: true };

export default [
  {
    files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ...project, tsconfigRootDir: root },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
];
