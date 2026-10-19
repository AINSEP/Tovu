# Tovu admin: one new ExternalMcpToolsModal test sees a cached tool list instead of its stubbed empty probe

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.
Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state.
Edit ONLY apps/admin/src/features/settings/__tests__/ExternalMcpToolsModal.unit.test.tsx, then report `CHANGED FILES:` + `NOT DONE:`.
REUSE the file's existing helpers. Smallest change. Never weaken an assertion. Move "why" comments with code, never delete them.

## Failure (deterministic: it fails at load 46 and again at load 7, under the machine lock)
```
FAIL ExternalMcpToolsModal.unit.test.tsx > closes without restoring focus to a non-HTML opener   (test at ~line 70)
TestingLibraryElementError: Unable to find an element with the text: This server advertises no tools.
```
The test calls `stubProbe(async () => Response.json({ tools: [] }))`. But the rendered DOM shows the picker's full list, with a row
for a tool named `read` (checked, warning badge) and "Select all" disabled. So the picker is not showing this test's stubbed empty probe.
Likely causes: the fetch-query cache in `wrapper` is shared across tests, so an earlier test's probe result for the same server key is
served, or `pickerProps` seeds tools, or the modal probes a different URL from the one stubProbe intercepts. Find the real cause by reading
the file's helpers, ExternalMcpToolsModal.tsx/.hooks.ts and ExternalMcpToolPicker. Then make this test get its own empty probe
(e.g. a fresh cache per test, as sibling tests do, or a distinct server id). The test is about focus: keep the focus assertions
(Close is focused on open, and on unmount focus does NOT go back to the SVG opener). Waiting for the empty-state text is only a
settle point. If a stable settle point other than the empty note is more correct, use it and say why.
