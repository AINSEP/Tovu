// Owner limits as ERRORS for the deps.ts split (lesson 41: check:size only errors at 80 lines per function).
// Usage (Tovu root): npx eslint --no-config-lookup -c designs/deps-split/work/limits.eslint.config.mjs <files…>
// Exit 0 = every listed file has functions <= 50 code lines, complexity <= 10, file <= 500 code lines.
import tsParser from "@typescript-eslint/parser";
export default [{
  files: ["**/*.ts"],
  languageOptions: { parser: tsParser, ecmaVersion: "latest", sourceType: "module" },
  linterOptions: { reportUnusedDisableDirectives: "off", noInlineConfig: true },
  rules: {
    "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
    complexity: ["error", 10],
    "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
  },
}];
