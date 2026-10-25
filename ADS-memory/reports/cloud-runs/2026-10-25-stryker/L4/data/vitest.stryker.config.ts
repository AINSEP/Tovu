import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';
export default mergeConfig(base, defineConfig({ test: { exclude: ['**/node_modules/**', '**/.stryker-tmp/**', '**/dist/**',
 '**/subpath-isolation.contract.test.ts','**/universal-entries.boundary.test.ts','**/marker-target-parity.unit.test.ts'] } }));
