### jini:packages/daemon/src/terminal-session.ts
- **Over:** `createTerminalSessionManager` 101
- **Phase:** now · **Batch:** size-17
- **Package entry:** re-exported by `src/index.ts` (`export * from './terminal-session.js'`); no export moves.
- **Tests:** `src/__tests__/terminal-session.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `const terminalService =` (~L210, 16 lines) | build the platform terminal service from options |
| B (stays) | `metadata`, `locks`, ownership check, CRUD/IO functions, return | per-principal session management |

- **Splits:**
  1. HELPER `createManagedTerminalService({ options }: CreateManagedTerminalServiceInput): ManagedTerminalService` (type = the initializer's current type; name it via the platform type it returns) — module level above the manager ← the `terminalService` initializer verbatim (its comment moves).
- **Importers to update:** none.
- **After:** `createTerminalSessionManager` ~86; helper ~18; file ~250.
- **Risks / notes:** pure construction; no ordering concern.
