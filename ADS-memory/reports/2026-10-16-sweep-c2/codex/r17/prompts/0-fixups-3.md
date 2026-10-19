# Tovu: five new coverage-test failures; find out whether the test or the code is wrong, then fix

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.
Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state.
Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:` + per failure `VERDICT:` (test bug | real product bug, file:line).
REUSE before you write. Smallest change. Never weaken an assertion to make it pass. If the product leaks a secret or
misbehaves, that is a real bug: do NOT change the test to hide it; describe the bug under NOT DONE with file:line and
the exact leaked value/position (another agent decides the product fix).
Edit only the five test files named below.

## 1. apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts
```
test at .../tool-registrations.faults.unit.test.ts:1:12288
✖ invalid credential controls are translated before reaching the destination adapter
  AssertionError [ERR_ASSERTION]: The input was expected to not match the regular expression /private|password@fixture/. Input:
  `[{"type":"resource","resource":{"uri":"ui://tovu/database-transfer-destination/536f2e42-...","mimeType":"text/html;profile=mcp-app","text":"<!doctype html>\n<html lang=\"en\">\n<head>\n<me ...
      at TestContext.<anonymous> (.../tool-registrations.faults.unit.test.ts:262:10)
```
Find which part of the serialized result matches: the literal word "private" anywhere in the MCP-app HTML/CSS
(e.g. a CSS/JS token) would be a test bug — then assert on the actual secret values the test planted instead.
If the planted password or private value really appears in the output, that is a real leak (report it, keep the test).

## 2. apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts
```
test at .../static-token-setup.unit.test.ts:1:22487
✖ a configuration check resolves an OAuth token through its injected service without disclosing it
  AssertionError: Expected values to be strictly deep-equal:
  +   ok: false,
  +   reason: "it has not been authorized yet (status 'disconnected') — connect it in Settings → External MCP"
  -   ok: true
      at TestContext.<anonymous> (.../static-token-setup.unit.test.ts:347:10)
```
Every other test in the file passes. Read features/external-mcp/tool-registrations.ts and how OAuth status is stored:
the fixture likely saves the server without a connected OAuth status. Set up the state the real flow produces
before the check (reuse sibling tests' setup), keeping the assertion that the token is not disclosed.
Goal for features/external-mcp/tool-registrations.ts: 100% lines/branches (now 94.21/86.26 from this file:
uncovered 22-23, 31, 159-169, 205, 211-230).

## 3. apps/website/src/features/custom-credentials/__tests__/create-agent-tool.unit.test.ts
```
test at .../create-agent-tool.unit.test.ts:1:28507
✖ a secret-shaped submitted label is refused without echoing it in the outcome
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /label/. Input:
  'Put credentials in the secret field, not in this field.'
      at TestContext.<anonymous> (.../create-agent-tool.unit.test.ts:610:10)
```
The refusal message is generic ("this field"). Assert the real message (and keep the "does not echo the secret" check).

## 4. apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts — HANGS
The file never reports a single test: its node --test child ran at 100% CPU for 14 minutes and was killed. The previous
round added these tests to it: "<operation> refuses a missing page without capturing a version", "read refuses an
unconverted document page", "write before read refuses to change the row or ledger", "write rejects a page <change> after
reading it", "converting an already HTML page captures its version without reseeding or revisioning", "conversion refuses
a trashed document before changing the body or revision ledger", "a page removed after the successful CAS does not receive
a phantom revision", "read refuses a stored HTML record whose body is absent". Find the busy loop (e.g. a fake whose
CAS/version never changes so a retry loop in apps/website/src/features/pages/html-document-store.ts spins forever, or a
loop in a test helper) and fix the test or fake so every test terminates. If the product retry loop has no bound, that is
a real bug: report it with file:line (do not change product code).

## 5. apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx
After the previous round added tests (one of them `vi.stubGlobal("fetch", ...)` for the wired controller), 5 EXISTING tests
in "useTrash — Load more paging (2026-09-21)" fail, e.g.:
```
FAIL  ... > two loadMore calls in the same tick send one request and append the page once
 ❯ src/features/trash/__tests__/use-trash.unit.test.tsx:586:47
    586|     await waitFor(() => expect(result.current.nextCursor).toBe("c2"));   (rendered <body><div/></body>)
```
also: "reports a current page failure, releases the load lock, and permits retrying that cursor", "a reload drops a stale
Load more page ...", "a stale loadMore's failure after a reload is not surfaced as an error", "a stale loadMore settling
after a reload does not release a newer call's in-flight lock". Make the new tests clean up after themselves (unstub
globals / restore fetch / reset shared state in the file's afterEach, as sibling admin tests do) so the old tests pass again.
Do not edit apps/admin/src/features/trash/rules.ts or trash-i18n.ts or their tests (another agent is changing them).
