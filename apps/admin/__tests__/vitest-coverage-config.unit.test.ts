// @vitest-environment node
// This Node configuration imports Vitest's CLI/esbuild; jsdom's typed-array realm is incompatible.
import { expect, test, vi } from "vitest";

// Coverage policy is independent of React transform plugins; avoid starting a second Vite pipeline.
vi.mock("@vitejs/plugin-react", () => ({ default: () => ({ name: "coverage-policy-test" }) }));
vi.mock("vitest/config", () => ({ defineConfig: (config: unknown) => config }));
import config from "../vitest.config";

// The denominator must retain unloaded source when a coverage run executes only a few tests.
test("admin coverage includes all runtime source and enforces the existing unit coverage policy", () => {
  const coverage = config.test?.coverage;
  expect(coverage?.include).toEqual(["src/**/*.{ts,tsx}"]);
  expect(coverage?.exclude).toEqual(["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**", "**/*.d.ts"]);
  expect(coverage?.thresholds).toEqual({ statements: 98, branches: 98, functions: 98, lines: 98 });
  expect(coverage?.reportOnFailure).toBe(true);
});
