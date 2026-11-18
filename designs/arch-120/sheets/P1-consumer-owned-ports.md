# Sheet P1 — low-rank features own the port shapes they declare (6 upward type edges)

Executor: one agent, unattended. Budget ≤ 200k context, ≤ 140 tool calls, 120 min. Branch `refactor/arch-120-p1` from a `$BASE` that contains R1. Design: REVISION-2 §4, rows N001 N002 N003 N016 N059 N064.
Owner rules: same as R1. Ports and DI: **the consumer declares the port; the provider satisfies it structurally; composition binds it.** No shells and no forwarders: do not leave a re-export of a moved type in its old file. Behavior is unchanged.

## 1. Prerequisites (each STOPs)

```bash
set -euo pipefail
F=apps/website/src/features
grep -q 'feature-ranks' development/scripts/check-architecture.ts || { echo "STOP P1: R1 not in base"; exit 1; }
for pair in \
  "agent-plugins/service-ports.ts:../api-connections/contribution.js" \
  "agent-plugins/service-ports.ts:../api-connections/connect.js" \
  "agent-plugins/service-ports.ts:../external-mcp/contracts.js" \
  "project-keys/shared-oauth-disconnect.ts:../api-connections/shared-owner.js" \
  "custom-credentials/tool-registrations.ts:../deployments/contracts.js" \
  "plugin-runtime/service-ports.ts:../post/index.js"; do
  grep -q "from [\"']${pair#*:}[\"']" "$F/${pair%%:*}" || { echo "STOP P2: import gone or moved: $pair"; exit 1; }
done
```

Lanes that touch these files: `wave3/admin-j3-t1a` (`external-mcp/contracts.ts`), `fix/vendor-names-out-of-core` (`api-connections/shared-owner.ts`) and `wave3/xpkg-c12obs-r12` (`custom-credentials/tool-registrations.ts`). If your base contains any of them, P2 re-checks the import. A changed type body is not a STOP; use the body on your base.

Run Setup and Gate block G for the base. `$RUN/base/architecture.new` holds the 6 lines of this sheet.

## 2. Characterization (green on base)

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks \
  "apps/website/src/features/agent-plugins/**/*.test.ts" "apps/website/src/features/api-connections/**/*.test.ts" "apps/website/src/features/external-mcp/**/*.test.ts" \
  "apps/website/src/features/project-keys/**/*.test.ts" "apps/website/src/features/custom-credentials/**/*.test.ts" "apps/website/src/features/plugin-runtime/**/*.test.ts" > "$RUN/char.log" 2>&1
```

The globs are quoted: node expands `**` itself. The run must exit 0; if it does not, STOP C1.

## 3. Moves, one commit each (Gate block G before each commit)

| step | edge | move | type-level red check (before the move, `npm run typecheck:tests` must FAIL on it; after, pass) |
|---|---|---|---|
| a | N002, N001 | Move the **declarations** of `DeclaredApiConnection` (from `api-connections/contribution.ts:33`) and `ApiConnectionConnectStatus` (from `api-connections/connect.ts`) into `agent-plugins/service-ports.ts`, the file that declares the port using them (`AgentPluginApiConnectionsPort`, `:41`). api-connections then imports both from `../agent-plugins/service-ports.js` (4 → 0, down). `service-ports.ts` is already exposed. If a moved declaration references other api-connections types (`ApiConnectionDescriptor`, `ApiConnectionDeclaration[...]`), STOP A1 and report the closure. Those come from `@jini-ai/*` or must move too, and the sheet does not guess. | an `agent-plugins/__tests__/unit/service-ports.types.unit.test.ts` assignment `const x: import("#src/features/agent-plugins/service-ports").DeclaredApiConnection = …` |
| b | N003 | Same for `ExternalMcpConnectStart` (`external-mcp/contracts.ts`): declare it in `agent-plugins/service-ports.ts` and have external-mcp import it (5 → 0, down). If external-mcp's own contract needs it under the same name, it imports it; no alias file. | same test file, one more assignment |
| c | N064 | `project-keys` owns `SharedOAuthOwnerStorage`. Declare an interface with exactly the members `shared-oauth-disconnect.ts` uses, in that file (today it is `ReturnType<typeof createSharedOAuthOwnerStorage>` in `api-connections/shared-owner.ts:79`). `shared-owner.ts` keeps its factory; where its return type is named, it imports the interface from project-keys (4 → 0, down). Typecheck proves conformance at the composition binding (`server/runtime/composition/agent-plugin-connections.ts`). | an assignment of `createSharedOAuthOwnerStorage(…)` to the project-keys interface in `project-keys/__tests__/` |
| d | N016 | `custom-credentials/tool-registrations.ts:91` declares `loadDeployTargets?: … => Promise<DeployTargetListPort>`. Declare in that file `interface DeployTargetListPort { list(): readonly { descriptor: … }[] }` with the descriptor fields read at `:295` and `:426`. Remove the `deployments/contracts` import. The route deps that bind it must typecheck without a cast. | an assignment of a `DeployTargetRegistry` value to `DeployTargetListPort` in a custom-credentials test |
| e | N059 | `plugin-runtime/service-ports.ts:7` returns `PostRecord`. Declare `PluginPostRecord` there with the fields plugin-runtime's consumers read (`grep -rn 'readRequired' apps/website/src/features/plugin-runtime`). If every field of `PostRecord` is read, STOP E1 and report: the port is then a domain record, and the decision goes to the owner. | an assignment of a `PostRecord` to `PluginPostRecord` |

After each step, re-run the step-2 command: exit 0, with the same pass list. Gate block G: `architecture.new` loses that step's lines, `boundaries.warns` gains nothing (G4), API surface does not rise (G6).

## 4. Finish

`git pull --rebase`, re-run G, push. Report the SHAs, any STOP A1/E1 closure lists, and the before/after NEW-line counts (6 → 0 on this sheet's rows).
