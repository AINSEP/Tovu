import tseslint from "/home/user/Tovu/node_modules/typescript-eslint/dist/index.js";
import sonarjs from "/home/user/Tovu/node_modules/eslint-plugin-sonarjs/cjs/plugin.js";
export default [{
  files: ["**/*.ts"],
  languageOptions: { parser: tseslint.parser },
  plugins: { sonarjs },
  rules: { complexity: ["error", 10], "sonarjs/cognitive-complexity": ["warn", 10] },
}];
