import { readFileSync } from 'node:fs';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

// A pinned migration may already have run in a user database and cannot be rewritten.
// Exclude those exact steps, while keeping the migration runner and new steps in scope.
const checksums = readFileSync(new URL('../../apps/website/src/platform/db/migrations/checksums.ts', import.meta.url), 'utf8');
const pinnedMigrations = [...checksums.matchAll(/^\s*"((?:[\w-]+\/)?\d{4}_[\w-]+)":\s*"[0-9a-f]{64}"/gm)]
  .flatMap(([, id]) => [
    `apps/website/src/platform/db/migrations/${id}.ts`,
    `apps/website/src/platform/db/migrations/${id}.postgres.ts`,
  ]);

export const complexityScopes = [
  'apps/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
  'packages/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
  'content/agent-plugins/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
];

export const complexityIgnores = [
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/.build/**', '**/coverage/**',
  '**/generated/**', '**/__generated__/**',
  // Fixtures can contain their own dependency trees and generated bundles; they are not production
  // debt and previously caused ESLint to fail resolving plugins while scanning them.
  '**/__tests__/**', '**/__measurements__/**', '**/__mocks__/**', '**/fixtures/**',
  '**/test/**', '**/tests/**', '**/*.{test,spec,typecheck,stories,story,generated,gen}.*',
  '**/*.{bundle,min}.{js,jsx,mjs,cjs}', '**/*.d.{ts,mts,cts}',
  ...pinnedMigrations,
];

const languageOptions = {
  parser: tseslint.parser,
  parserOptions: { ecmaFeatures: { jsx: true } },
};

export const complexityConfig = [
  {
    files: complexityScopes,
    ignores: complexityIgnores,
    languageOptions,
    plugins: { sonarjs },
    linterOptions: { noInlineConfig: true },
    rules: { complexity: ['error', 10], 'sonarjs/cognitive-complexity': ['error', 10] },
  },
  {
    files: ['apps/admin/src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    ignores: complexityIgnores,
    rules: { complexity: ['error', 9], 'sonarjs/cognitive-complexity': ['error', 9] },
  },
];

// The standalone scan uses only these two rules; the editor imports the same scoped blocks.
export default [{ ignores: complexityIgnores }, ...complexityConfig];
