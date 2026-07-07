## 11. Architecture Enforcement

Architectural rules are not just documented — they are enforced by tooling so that violations are caught at build time, not in code review.

```typescript
// 1. TypeScript project references enforce compile-time boundaries.
// Each package's tsconfig.json lists explicit allowed references.
// If @tovu/kernel tries to import @tovu/db-postgres, tsc will fail.

// 2. Custom ESLint plugin: @tovu/lint-architecture
// Rules:
//   - @tovu/kernel cannot import from any other @tovu/* package
//   - @tovu/content can only import from @tovu/kernel
//   - @tovu/db-* can import from @tovu/content + their external DB lib
//   - @tovu/react can import from @tovu/kernel, @tovu/content, @tovu/theme + react
//   - NO circular dependencies anywhere

// 3. package.json exports maps control what is public API vs internal.
// packages/kernel/package.json
{
  "exports": {
    ".":         "./src/index.ts",
    "./hooks":   "./src/hooks/index.ts",
    "./internal": null            // Explicitly blocked — no package can reach internals
  }
}
```

**Why this matters:** Architecture rot almost always starts with a "temporary" shortcut — a core package importing a specific DB utility directly, or a plugin importing from another plugin's internals. These three layers of enforcement (TypeScript references, ESLint rules, exports maps) make that shortcut a build failure rather than a code smell.

---

