Programmer / Refactor (Execution): implementation and behavior-preserving cleanup.

**Incomplete:** edits target 73 supplied findings; 33 remain unresolved by inspection. No tests, compiler, or guard ran. No commits, guard changes, or debt allowances were made.

| Family | Changes |
|---|---|
| HW3 | Readonly lookup tables; provider-owned queue namespaces; factory-owned SVG runtime. |
| HW1 | Injected `hostEnv` default in `mcp-bridge-probe.ts`. |
| HW2 | SDK types and schema parsing moved behind `mcp/src/server/adapters/protocol.ts`. |
| HW8 | Example endpoint moved into the media-provider catalog. |
| R10 | Added missing exports in `chat/src/react/index.ts`. |
| R13 | Added nine listed model IDs in `defs/{codex,antigravity}.ts`; dates updated. |
| SI-domain | Shared schemas, model policy, consent vocabulary, and session implementation moved into existing contracts/core layers. |
| SI-dependency | Updated diagnostics, OAuth, vibecoding manifests and lockfile to use optional peers. |
| N1/N2 | Neutralized four comments while preserving their rationale. |

The [handoff and complete file inventory](/Users/la/Programming/tovu-integration-clones/jini-guard/ADS-memory/.local-artifacts/codex/2026-10-24-guard-cleanup/handoff.md) records the remaining findings:

- **16 L0:** missing approved layer registration for `search`.
- **11 L1:** sibling-layer dependencies in owner-store and vibecoding.
- **5 SI-domain:** owner-store and saved-request composition boundaries.
- **1 HW3:** Claude’s documented process-lifetime probe cache.

These need Coordinator layer, ownership, or API decisions. **No escape hatches were used.** Two readonly-alias false positives in search and commerce now use equivalent explicit types, with why comments.

Checker commands:

```sh
pnpm guard
for package in admin agent-plugins agent-runtime chat cms commerce core daemon diagnostics mcp memory oauth platform search ui vibecoding; do
  pnpm --dir "packages/$package" exec tsc -p tsconfig.json --noEmit
done
```

[Exact focused Vitest commands](/Users/la/Programming/tovu-integration-clones/jini-guard/ADS-memory/.local-artifacts/codex/2026-10-24-guard-cleanup/verification.md) list existing test targets per package, all using `--maxWorkers=2 --minWorkers=1`.
