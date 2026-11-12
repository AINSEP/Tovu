// Minimal flat config: only `complexity` (max 10) + sonarjs cognitive complexity (max 10), no type info.
import { createRequire } from "node:module";
const require = createRequire("/home/user/Jini/package.json");
const tseslint = require("typescript-eslint");
const sonarjs = require("eslint-plugin-sonarjs");
const basePath = process.env.LINT_BASE ?? "/home/user/Jini";
export default [
  { basePath, linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" } },
  {
    basePath,
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    plugins: { sonarjs: sonarjs.default ?? sonarjs },
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { complexity: ["error", 10], "sonarjs/cognitive-complexity": ["error", 10] },
  },
];
