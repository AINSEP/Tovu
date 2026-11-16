# ACP for Jini's agent adapters: index (2026-11-16, revision 2)

**Status: COMPLETE** (revision 2, after the Codex judge). Docs only; no source file was edited and nothing was run.
Branch: Tovu `plan/acp-research-2026-11-16`. Jini read at `integ/wave-b-r2` @ `02edbb68`.

## Files

| File | What it holds |
|---|---|
| `RESEARCH.md` | What ACP is today; what ACP code Jini has and where it falls short (G1–G12); each CLI's ACP route; what ACP does not solve; the unverified list; sources pinned by commit |
| `CLI-MATRIX.tsv` | One row per Jini def (28) plus Gemini CLI |
| `DESIGN.md` | Revision 2: who does what, target shape (§3.2–§3.11), numbers, risks, lane K, steps P and A0–E, security surface, owner practices, lessons 1–23, owner decisions O-1 to O-15, **Judge response** |
| `DELETION-LEDGER.tsv` | Every file or symbol that could be deleted under ACP: lines, class, why, which step, callers. Totals and the lane-K split are at the bottom |
| `CODEX-JUDGE.md` | The adversarial review this revision answers (not edited) |

## Judge outcome

13 findings (2 blockers, 11 majors). Each was re-checked in code before being accepted.
**12 accepted, 1 accepted in part, 0 blockers left.**

- Rebutted sub-point (finding 12): "R8 §12.14 is absent". It exists: the judge read `5bf9c7fb` (331 lines); the file was replaced in `23b2132b` and has §12.14 at line 475. The citation had no commit, which was my fault and is fixed.
- Corrected in the judge's own text (finding 1): `NativeToolPolicyInput` has four fields, not five. The finding stands.
- Three findings turned out wider than stated: resume over ACP works for **no** CLI today (4); the tool-loss case also hits OpenCode, the first planned target (2); the existing AMR hooks have no caller at all (7).

## The answer in short

1. **Jini already has the ACP client**; 12 of 28 CLIs use it. It has real defects today: no run resumes, a concrete model can fail the run, effort is not sent, cost updates are dropped, an unknown agent request hangs ten minutes. **Fix it (Phase A).**
2. **ACP is not a line saving.** Ledger: at most 1,254 lines go, about 1,290 are added. Break-even (−350 to +250). Another 1,203 go only if amp and codebuddy also leave the Claude stream format. 212 lines of unused Gemini code can go today, with or without ACP.
3. **The gain is function**: tool events, a permission gate and resume for the CLIs that run as plain text (qwen, droid, grok-build).
4. **Move only CLIs whose own binary speaks ACP**, one at a time, behind a host opt-in. OpenCode first.
5. **Claude: no.** A second program on the security path, the whole launch policy to re-express, about 50 lines saved. **Codex: trial at most.**
6. **Lane K does not wait.** 1,036 of its 1,272 lines (81%) are still needed under ACP; 161 could ever go, and those need Claude to move.

## Changed since revision 1

| Was | Is |
|---|---|
| net 1,900–3,400 lines fewer | break-even |
| Claude last | Claude not moved |
| lane K: 57% still needed | 81% |
| Phase A: seven steps, agent-runtime only | size prerequisite P, then A0–A9 across agent-runtime and daemon |
| Claude profile gets `NativeToolPolicyInput` | the ACP variant gets everything native `buildArgs` gets; one policy owner, two renderers; fails closed |
| ACP variant switches MCP delivery to `acp-merge` | a variant keeps its def's delivery; two guards; HTTP in `session/new` is its own step (A8) |
| the def is swapped inside `defs.get` | the runtime builds one catalog, read by detection, probing, launch and lookup |
| unsupported model → continue on the default | typed failure; never another model |
| new usage event | existing cumulative-cost fields for USD; occupancy and other units need a protocol decision |

## Owner decisions (details in `DESIGN.md` §11)

New or changed: **O-2** Claude no, Codex trial only · **O-10** resume starts working for `amr` · **O-11** protocol fields for context size and non-USD cost · **O-12** process-group spawn · **O-13** size prerequisite or exception · **O-14** unused AMR code in the shared client: delete or wire up · **O-15** remove the unused Gemini parser.
Unchanged: O-1 fix the client · O-3 lane K now · O-4 soak length · O-5 keep the no-ACP CLIs · O-6 stay on v1 · O-7 hand-written client · O-8 pi stays on pi-rpc · O-9 kiro and kimi drift.

## Not done, and why

1. Nothing was run. Every adapter behaviour in `DESIGN.md` §3.6 is what the source says. The six live checks there are the gate, and they are not done.
2. Not traced: who reads `cumulativeCostUsd`; whether the ACP path has a secret-masking seam for raw stdout and stderr; whether effort can reach an ACP def today; whether `opencode acp` needs the log-file staging. All four are in `RESEARCH.md` §6.
3. Added-code figures in the ledger are estimates. Deletion figures are counted.
4. Cursor, Qoder, Droid, Grok Build, CodeBuddy and Antigravity still rest on their registry entry only (vendor doc hosts are outside this session's network).

## Re-run the counts

```sh
cd Jini   # integ/wave-b-r2 @ 02edbb68
grep -rhE "^\s*streamFormat: *'[a-z-]*'" packages/agent-runtime/src/defs --include=*.ts --exclude-dir=__tests__ | sed 's/^ *//; s/,$//' | sort | uniq -c
grep -rnE "eventParser: *'[a-z-]+'" packages/agent-runtime/src/defs --include=*.ts --exclude-dir=__tests__      # opencode, mimo, codex, antigravity: nothing selects the Gemini parser
grep -rn "mcpHttp: true" packages/agent-runtime/src/defs                                                         # claude, codex, opencode
grep -rn "modelUnavailableErrorCode\|accountFailureClassifier" packages --include=*.ts -l | grep -v __tests__     # only inside agent-protocol/acp
grep -n "resumeSessionId\|getDurableSessionId" packages/daemon/src/agent-executor/events.ts                      # no hit: resume never reaches the ACP client
for d in claude codex opencode antigravity pi gemini; do find packages/daemon/src/agent-executor/$d -name '*.ts' -not -path '*__tests__*' | xargs wc -l | tail -1; done   # 1,272
```
