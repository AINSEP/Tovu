# Tovu admin: one new use-trash test calls act() with a promise and breaks the 4 tests after it

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.
Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state.
Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`. REUSE before you write. Smallest change.
Never weaken an assertion. Move "why" comments with code, never delete them.
Edit ONLY apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx. Do not touch trash rules.ts, trash-i18n.ts or
their tests (another agent is changing them), and do not touch product hooks.

## Failure (verified 12:40 under the lock; the same 5 fail when run with -t "Load more paging", so it is NOT a fetch-stub leak)
```
FAIL use-trash.unit.test.tsx > useTrash — Load more paging (2026-09-21) > reports a current page failure, releases the load lock, and permits retrying that cursor
stderr: You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);
AssertionError: expected false to be true
 ❯ use-trash.unit.test.tsx:570:40
    569|     act(() => result.current.loadMore());
    570|     expect(result.current.loadingMore).toBe(true);
then the next 4 tests in that describe fail with `result.current` null (rendered <body><div/></body>), e.g.
 ❯ use-trash.unit.test.tsx:588:47   await waitFor(() => expect(result.current.nextCursor).toBe("c2"));
```
## Diagnosis
The new test (added at ~line 565) uses `act(() => result.current.loadMore())` at lines 569, 576 and 581. `loadMore` is async
(hooks/use-trash.hooks.ts:186), so the arrow RETURNS a promise, act treats it as an un-awaited async act, the state update
is not flushed (loadingMore false), and the dangling act scope breaks every later renderHook in the file.
Every sibling test uses the statement form: `act(() => { void result.current.loadMore(); });` (lines 482, 591).
Fix: use that same form at 569/576/581 (and anywhere else in the r16 additions that passes a promise-returning call to a
sync act). Keep all assertions. If, after that, the "loadingMore is true while the request is in flight" expectation still
could not hold by reading the hook, say so under NOT DONE with file:line instead of deleting it.
