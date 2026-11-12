// Standalone a11y lint for the SEC quality audit (report only): eslint-plugin-jsx-a11y@6
// `recommended` rules, typescript-eslint parser WITHOUT type info, inline config off.
// Env: SEC_TOOLS = dir whose node_modules holds the pinned eslint/typescript-eslint/jsx-a11y.
import { createRequire } from 'node:module';
import path from 'node:path';

const req = createRequire(path.join(process.env.SEC_TOOLS, 'package.json'));
const tseslint = req('typescript-eslint');
const jsxA11y = req('eslint-plugin-jsx-a11y');

export default [
  {
    files: ['**/*.{tsx,jsx}'],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'jsx-a11y': jsxA11y },
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },
];
