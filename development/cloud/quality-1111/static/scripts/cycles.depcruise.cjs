// Cycle-only dependency-cruiser config (report-only). tsConfig is passed per run via --ts-config.
module.exports = {
  forbidden: [{ name: "no-circular", severity: "warn", from: {}, to: { circular: true } }],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|dist|build|coverage|vendor|__tests__|__mocks__|__measurements__|__fixtures__|fixtures|test|tests|e2e|\\.build|release)/|\\.(test|spec|typecheck|stories)\\.|\\.d\\.(ts|mts|cts)$|\\.test-support\\.|/plugins/[^/]+/[0-9]+\\.[0-9]+\\.[0-9]+/" },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"], extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".d.ts"] },
  },
};
