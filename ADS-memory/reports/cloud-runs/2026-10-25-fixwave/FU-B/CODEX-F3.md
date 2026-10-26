Code Inspection(Review): Persona loaded for source correctness and AP1–AP15 test review.

F3 has three findings:

- **Medium — `packages/agent-runtime/src/auth.ts:126`**  
  The self-match bug is real, with a failing test committed before the fix. However, `"DEEPSEEK_API_KEY is empty"` and `"DEEPSEEK_API_KEY invalid"` now return false; `classifyAgentAuthFailure` loses its previous missing-auth result. Smallest fix: recognize explicit negative credential states while keeping healthy variable mentions accepted, with regression cases for both.

- **Medium — `packages/memory/src/__tests__/note-store.containment.test.ts:40` — AP7**  
  Cases including `a/b`, `Secret`, `secret\n`, and `.secret` create no file at their corresponding target path. They still pass if ID validation breaks because the missing-file fallback returns null and deletion finds nothing. Smallest fix: create each case’s exact target file inside the temporary root, then assert it remains unreadable and unchanged.

- **Low — `packages/chat/src/core/question-answer.ts:42`**  
  The extraction introduces `labels.push(...selections)`. A sufficiently large string-selection array now exceeds the engine’s argument limit and throws, violating the documented “never throws” contract; the previous loop handled it. Smallest fix: append iteratively or concatenate arrays.

The delivery-state and usage extractions preserve behavior. The three owner-approved behaviors have no source changes in this diff. No new process, temporary-file, or network leaks found by static inspection.

Reviewed the lane report and requested diff. No edits, tests, or servers run; reported green results were not independently verified.
