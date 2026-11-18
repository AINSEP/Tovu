# chat-e2-fix report (2026-11-18, unattended plan-edit run)

Sheet: `C-CHAT-DEPS` = `GAPS-2026-11-16.md` §1 on Tovu `plan/untangle-gaps-2026-11-16`. Changes are in plan documents only. This run committed nothing to Jini or Tovu product code. Every product edit below was a scratch prototype in a local checkout, used to measure the facts, and was then reverted.

## Verdicts

| Item | Verdict | Where |
|---|---|---|
| E2 (chat user-text redaction onto core's engine) | **EXECUTABLE** | §1.4 C (E2-1 core, E2-2 chat) |
| S6 (chat manifest; the ~14 test files that hold it) | **EXECUTABLE** | §1.6 (S6-a…d) |

E2 still has one owner-facing condition. Six chat answers change (list below), and each is pinned by a red-first case. If the owner rejects one, the sheet STOPs. It does not add a chat rule to undo the change.

## Facts regenerated (Jini)

- **Base mismatch.** The brief says `wave2/chat-deps` sits on `refactor/terra` `4c1892368`. It sits on `65d73b0d`, and terra is 103 commits ahead of that point.
  - `git merge-tree --write-tree origin/refactor/terra origin/wave2/chat-deps` exits 0, and the two branches share only `scripts/injection-debt.json`.
  - None of those 103 commits touches `core/src/redact.ts` or chat's redaction/format files.
  - Terra `8c420723` already moved `@jini-ai/agentic` from chat's dependencies to its devDependencies, and both manifest tests changed with it.
  - The sheet now says to merge terra first.
- **The 14 reds were reproduced exactly.** This run applied the C5 D3 recipe verbatim on `cf44d50b` and got 14 failures: 13 in `user-text-redaction.test.ts` and 1 in `question-form/__tests__/format.test.ts`. They have three causes:
  - **(a) Prose, 1 test.** Core's short-Bearer rule has no prose exemption.
  - **(b) Re-masking, 12 tests.** Chat's internal placeholder `[REDACTED:chat_secret]` is not a marker core generates, so core's Bearer and label rules mask it again on the second pass.
  - **(c) Placeholder, 1 test.** Core's label vocabulary includes `api key` (with a space), so the line chat formats, `- API key: (skipped)`, reads as a credential.
  - **Untested gap (d).** Core's `sk_key` needs 20+ characters; chat's own rule masked 16+.
  - The executor's note "not idempotent on `Bearer [REDACTED:..]`" is cause (b).

## What changed in the plan

1. **§1.4 C rewritten as E2-1 + E2-2.** It gives exact files and line anchors, and the diff text.
   - **Core (E2-1).**
     - A new constant `BEARER_PROSE_VALUE_RE` exempts a Bearer value only when it is *exactly* one of the prose words, plus one closing sentence mark. This is stricter than chat's old `\b` rule, which let `Bearer auth-1a2b3c` leak.
     - The short-Bearer collector skips such values.
     - `sk_key` goes from `{20,}` to `{16,}`.
     - Chat's two why-comments (the Bearer prose comment and the `-xoxb` Slack comment) move into `redact.ts`.
     - A changeset bumps core minor.
   - **Chat (E2-2).**
     - Chat deletes `CHAT_RULES` and calls `redactSecretsWithCounts` with no `extraPatterns`.
     - Its placeholder becomes `[REDACTED:credential]`, a category core generates, so core treats it as already masked.
     - `format.ts` redacts each line separately and never sends its own `(skipped)` placeholder to the engine.
   - **What this run measured.** It applied the prototype on `cf44d50b`:
     - All 14 originally red tests pass, and the six pre-existing suites pass **unchanged** (218 of 218).
     - Core passes 2934 of 2934, plus 22 of 22 in the new test file.
     - Every `src/core` test in chat passes (1486 of 1486).
     - Full chat suite (two forks): 304 files passed and 1 skipped; 4447 tests passed and 1 skipped. That is the base's 4436 plus the 11 pin cases, with no other change.
2. **The red-first core test is written out in full** (`core/src/__tests__/redact.user-text.test.ts`, 22 cases). On the unmodified engine, 12 of them are red: all 10 prose cases and both short-`sk-` cases. This run checked that count.
3. **The chat pin file is written out in full** (`user-text-redaction.core-engine.test.ts`, 11 cases). On the base, 6 are red; these are the behaviour deltas. The other 5 hold on both base and after.
4. **The 14 tests stay in chat, unchanged**, as the gate.
   - The prose case gets a core twin.
   - The 12 placeholder cases are chat's own code. Their supporting core property ("generated markers survive a second pass") is pinned in core.
   - The format case is chat-only.
   - Gap (d) gets a test in each package.
5. **Core's callers, listed by command.** The command finds 14 packages that reach the engine directly or through core's wrappers: agent-plugins, agent-runtime, analytics, chat, cli, cms, daemon, diagnostics, http-kit, integrations, mcp, platform, plugins and ui.
   - With the core edit applied, 12 of the 13 non-chat suites were fully green.
   - daemon had 1 red: `uploads.characterization` "an empty body is refused…". It passes alone both with and without the change, so it is a load flake, not a redaction answer.
   - The fixture-census commands found only header inputs (in mcp) and a provider hint (in integrations), and all of them passed.
6. **§1.6 (new): S6 file by file.** It covers 14 rows; the table has the full per-file fates.
   - **Moved to the package that owns the composition.**
     - Tovu admin owns the real `chatSurfaces`/`chatKit` binding. It receives the A2UI registry cases and the delivery case, the registry file, and the real-driver Composer and ToolCard cases.
     - `examples/reference-web` builds the combined capability manifest and receives that check.
   - **Rewritten on fakes of chat's own ports.** These are `ChatSurfaces.page`, a recording `ChatSurfaces.mcpUi.Host`, and a new `fakeChatPagePort`. The fakes also remove three `as unknown as PageDriver` casts.
   - **Single-package halves get twins.** agentic's `createDriverPagePort` has no test today and gets 8 or more. ui's `McpUiHost` gets one where an assertion has no existing equivalent.
   - **Order.** Tovu lands before chat deletes anything, and the manifest commit (S6-d) carries its own manifest tests, so it stays green.
   - **STOP commands.** All three manifest/edge STOP lines are in fenced blocks, and each was checked to fire on the current tree.
   - **No integration-tests package.** `packages/integration-tests` is no longer needed for chat. CH6 and the G-TESTS paragraph now point to §1.6.
7. **The tool-call S8 wait is recorded in §1.2.** S8 needs E2-1 and E2-2 in its base, which matches tool-call `INDEX.md` row S8 ("E2 in base").
8. **`sheets/C5.md` D3 is marked superseded** for chat, so the two sheets do not contradict each other (lesson 29).

## Behaviour deltas for chat users (owner sign-off asked)

Each one is a red-first case in the E2-2 pin file:
1. `Bearer auth-1a2b3c` is now masked. Before, it leaked through chat's `\b` exemption.
2. A pasted `[REDACTED:<foreign name>]` after `api_key=` or `Bearer` becomes `[token removed]`, and the "I removed a key" notice fires. Anywhere else, a foreign marker is still kept byte for byte.
3. Core's labels mask `<label>: value` lines that diagnostics left alone: `API key: abc`, `token: abc`.
4. `Authorization: Bearer token` (a literal prose word) is now kept.
5. `Bearer`'s own case and whitespace are kept: `bearer\tabc` stays `bearer\t[token removed]`.
6. Form answers are redacted line by line. A secret split across two answer lines is no longer seen as one string, but each answer is still redacted twice.

## Still open

- **What "no rule of its own" covers.** This run read the owner decision as covering chat's *rule list* only. Chat keeps its user-text policy: the entropy/path stage, marker protection and `secretField`. If the owner meant the entropy stage too, moving it into core is a separate sheet (it would change core's answers for every caller).
- **Pre-existing chat behaviour, not changed here.** Chat's literal-marker protection keeps any `[REDACTED:<text>]` verbatim when it is not in a credential position, including text that is itself a secret. Core deliberately refuses that. Worth a separate look.
- **The SSE decoder fit is unproven.** From chat-deps' report: no test any more proves that agent-runtime's `decodeSseStream` fits chat's decoder port. It is not part of S6's manifest work. It could be a twin in agent-runtime or in Tovu.
- **E2-2 claims rest on a prototype.** The executor must re-run every gate on the terra-merged base (lesson 43). The numbers above are from `cf44d50b`.
- **Sizes.** E2 is about 25k (it was 10k). S6 is about 70k Sonnet plus the Tovu half.

## Commits (Tovu `plan/untangle-gaps-2026-11-16`, fast-forward)

- `addb1d3d` plan(gaps C-CHAT-DEPS): E2 and S6 rewritten executable (chat-e2-fix)
- the commit that adds this report also points CH6 and G-TESTS item 3 at §1.6
