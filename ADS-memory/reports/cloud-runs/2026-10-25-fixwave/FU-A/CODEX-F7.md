Code Inspection(Review) + TDD: selected for behavior preservation and test validity. Reviewed F7 `2687049e5`; line numbers refer to that branch.

- **Medium — [content-target-inputs.test.ts:266](/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/content-target-inputs.test.ts:266):** Removing the workspace guard still passes: both the input selector and foreign asset ID are `"x"`. **Smallest fix:** resolve slug `"logo"` to foreign ID `"x"` and expect `"logo"` unchanged; add the same-workspace positive case. AP8/F4.3.

- **Medium — [content-target-inputs.test.ts:287](/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/content-target-inputs.test.ts:287):** Moving `beforeLookup` after authorization still passes because the steps use separate logs. **Smallest fix:** record both events in one array and assert their sequence. F6.1.

- **Medium — [daemon-access.unit.test.ts:132](/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/daemon-access.unit.test.ts:132):** Foreign-run, off-list, and missing-resolver denials assert only status; incorrect or empty error bodies remain green. **Smallest fix:** assert each expected error body/code and `nextCalls === 0`. AP1/F1.2.

The `validateConfig` extraction preserves behavior. Owner-approved source pins remain untouched. OIDC exemptions retain exact file-and-call matching; other unresolved calls remain visible, including the unexempted visitor-confirmation call.

No process, temporary-file, or network leaks identified. Static review only; no edits, tests, or servers run.
