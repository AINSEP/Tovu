// UNTRACKED F1 Stryker-only config: excludes the two suites L1 found cannot run in a sandbox
// (cwd-relative source read; comment-text assertions stripped by the instrumenter).
import { defineConfig, mergeConfig, configDefaults } from 'vitest/config';
import base from './vitest.config';
export default mergeConfig(base, defineConfig({ test: { exclude: [...configDefaults.exclude, 'src/core/__tests__/runtime-boundary.test.ts', 'src/react/members/__tests__/fqfix-disable.unit.test.ts'] } }));
