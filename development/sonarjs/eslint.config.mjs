import { fileURLToPath } from 'node:url';
import { sonarIgnores, sonarSourceConfig, sonarVendorSha1Override } from './policy.mjs';

// Isolated config: no Biome, core complexity, local rules, or architecture gates.
export default [
  { ignores: sonarIgnores },
  {
    ...sonarSourceConfig,
    languageOptions: {
      ...sonarSourceConfig.languageOptions,
      parserOptions: {
        ...sonarSourceConfig.languageOptions.parserOptions,
        project: './development/sonarjs/tsconfig.json',
        tsconfigRootDir: fileURLToPath(new URL('../../', import.meta.url)),
      },
    },
  },
  sonarVendorSha1Override,
];
