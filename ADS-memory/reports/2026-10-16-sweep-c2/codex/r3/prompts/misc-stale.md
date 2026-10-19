# Two stale Tovu website tests

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`.
REUSE before you write. Smallest change. Move "why" comments with code, never delete them. Edit test
files only.

## 1. apps/website/src/features/redirects/__tests__/tool-registrations.model-facing-errors.test.ts:96
```
redirects_create: an invalid pattern is REDIRECTS_VALIDATION with the chokepoint's own reason
+ "REDIRECTS_VALIDATION: matchType 'regex' is not enabled in v1"
- "REDIRECTS_VALIDATION: matchType 'regex' is not enabled in v1 (REQ-22)"
```
Jini 30290220 deliberately dropped `(REQ-22)` from the message (read it: `git -C /Users/la/Programming/Jini show 30290220`).
Tovu commit 0c6d3713c already updated the sibling tool-registrations.redirects.test.ts the same way;
follow that commit's approach (`git show 0c6d3713c`).

## 2. apps/website/src/features/agent-plugins/__tests__/unit/install-tool.unit.test.ts › "agent tool rejects malformed input and invalid archives at preview"
```
AssertionError: The error is expected to be an instance of "ToolInputError". Received "Error"
  actual: Error: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.
```
Since fec2a6a9f (10-15) node:test refuses sites/site-key I/O against the real home. Add the isolated
catalog home as the FIRST import, like its siblings (e.g. apps/website/src/assistant/__tests__/external-mcp-store.test.ts:1:
`import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";`, with the right relative path).
