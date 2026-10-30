import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

// Owner-authorized local policy until @jini-ai/devops exports a shared SonarJS policy.
// Replace this import boundary with that export when published; do not copy a Jini list.
// Reviewed against all 279 rules and docs shipped by eslint-plugin-sonarjs 4.2.0.
export const sonarSkippedRules = {
  'no-unused-function-argument': 'Required (input, options = {}) signatures retain unused options.',
  'function-name': 'React components use PascalCase.',
  'variable-name': 'API fields and imported contracts retain their external names.',
  'class-name': 'Naming conventions belong to existing formatter/type tooling.',
  'file-name-differ-from-class': 'Framework entry filenames need not match exports.',
  'file-header': 'No mandatory per-file header template exists.',
  'comment-regex': 'No project comment pattern is prescribed.',
  'arrow-function-convention': 'Formatting belongs to Biome.',
  'shorthand-property-grouping': 'Property ordering is cosmetic.',
  'conditional-indentation': 'Indentation belongs to Biome.',
  'no-tab': 'Whitespace belongs to Biome; generated fixtures contain tabs.',
  'no-redundant-parentheses': 'Parentheses formatting belongs to Biome.',
  'max-lines': 'Raw file size is not a standalone quality finding.',
  'max-lines-per-function': 'Raw function size is not a standalone quality finding.',
  'cyclomatic-complexity': 'Keep the existing core complexity rule and scope thresholds.',
  'no-implicit-dependencies': 'Does not resolve the project tsconfig aliases reliably.',
  'no-reference-error': 'Mixed browser/Node hosts lack a shared globals contract; TypeScript owns name resolution.',
  'no-undefined-assignment': 'Optional properties deliberately use undefined for absence.',
  'no-wildcard-import': 'Barrel exports and namespace imports are intentional.',
  'max-union-size': 'Discriminated unions routinely exceed the default cap of three.',
  'strings-comparison': 'Canonical timestamps and other ordered string values use lexical comparison.',
  'no-require-or-define': 'Desktop CommonJS entries intentionally use require.',
  'no-unused-vars': 'Already covered by Biome.',
  'unused-import': 'Already covered by Biome.',
};

// v4 recommended is a flat-config object with a rules map containing BOTH error and off.
// Preserve its options, demote enabled entries, then include every nonrecommended rule
// except the explicitly justified convention/configuration exclusions above. This also
// includes all bug, security-hotspot and reliability rules outside recommended.
export const sonarRules = {
  ...Object.fromEntries(Object.entries(sonarjs.configs.recommended.rules).map(([name, value]) => {
    const [severity, ...options] = Array.isArray(value) ? value : [value];
    return [name, severity === 'off' || severity === 0 ? 'off' : ['warn', ...options]];
  })),
  ...Object.fromEntries(Object.keys(sonarjs.rules).filter((name) =>
    name in sonarSkippedRules || !sonarjs.rules[name].meta.docs.recommended
  ).map((name) => [
    `sonarjs/${name}`, name in sonarSkippedRules ? 'off' : 'warn',
  ])),
  'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
  'sonarjs/no-nested-functions': ['warn', { threshold: 4 }],
  'sonarjs/max-switch-cases': ['warn', 30],
  'sonarjs/cognitive-complexity': ['warn', 15],
};

export const sonarSourceFiles = [
  'apps/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
  'content/agent-plugins/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
];

export const sonarIgnores = [
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/.build/**', '**/coverage/**',
  '**/vendor/**', '**/*.d.ts', '**/*.d.mts', '**/*.d.cts',
  '**/__tests__/**', '**/__measurements__/**', '**/__mocks__/**', '**/fixtures/**',
  '**/test/**', '**/tests/**', '**/*.{test,spec}.*',
  'apps/desktop/release/**', 'apps/desktop/release-verify/**', 'apps/desktop/staging/**',
];

export const sonarSourceConfig = {
  name: 'tovu/sonarjs-report',
  files: sonarSourceFiles,
  ignores: sonarIgnores,
  plugins: { sonarjs },
  settings: sonarjs.configs.recommended.settings,
  linterOptions: { noInlineConfig: true },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  rules: sonarRules,
};

// Exact-file exception, not a rule-wide one: Netlify's and Vercel's deploy APIs REQUIRE SHA-1
// file digests (Netlify's deploy manifest + upload URLs, Vercel's file refs + x-vercel-digest
// header). The digest is a content address dictated by the vendor wire format, not a security
// control, and substituting SHA-256 would break uploads. Every other file keeps sonarjs/hashing.
export const sonarVendorSha1Override = {
  name: 'tovu/sonarjs-vendor-sha1',
  files: [
    'content/agent-plugins/netlify/targets/netlify.mjs',
    'content/agent-plugins/vercel/targets/vercel.mjs',
  ],
  plugins: { sonarjs },
  rules: { 'sonarjs/hashing': 'off' },
};
