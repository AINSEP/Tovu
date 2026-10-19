# Tovu: fix a coverage test that imports a symbol its module does not export

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.
Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state.
Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`. REUSE before you write. Smallest change.
Do NOT edit anything under apps/website/src/assistant/** or apps/website/src/server/runtime/composition/** (another agent owns them).
Edit only /Users/la/Programming/Tovu/apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts.

## Failure (node --test, 2026-10-17; the previous coverage round added ~230 lines to this file)
```
apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts:5
import { InMemoryExternalMcpServerRepo, openExternalMcpOAuthPayload, readEnabledExternalMcpConfigs, saveExternalMcpServer } from "#src/assistant/index";
SyntaxError: The requested module '#src/assistant/index' does not provide an export named 'openExternalMcpOAuthPayload'
```
The whole file fails to load, so features/external-mcp/tool-registrations.ts drops to 76% lines.

## Do
Find where `openExternalMcpOAuthPayload` is really exported (or the existing public way tests reach that behavior:
check sibling tests in features/external-mcp/__tests__/ and assistant/__tests__/) and import it from there. Do not add an
export to apps/website/src/assistant/index.ts. If the test needs something that has no public path, rewrite that test to
go through the public API instead, keeping the behavior it asserts. Keep every other test in the file as is. Check every
other import in the file the same way (each named import must exist in the module it is imported from).
Goal for features/external-mcp/tool-registrations.ts: 100% lines/branches/functions (was 99.5/76.9).
