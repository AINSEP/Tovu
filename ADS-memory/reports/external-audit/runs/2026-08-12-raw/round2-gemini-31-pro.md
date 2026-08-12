```json
{"threat_model_accepted": true, "rejection_reason": "",
 "auditor_scope_check": "Audited the provided self-contained Round 2 Work Log, File Artifacts, Validation results, and Open Questions. Assumed NO read access to the repo per instructions and relied entirely on the provided evidence base.",
 "ledger_updates": [
   {"id": "IV-F1", "verified": true, "note": "Verified via Validation section confirming negative verification of the fix.", "causal_claim": "save() unguarded against stale responses in use-widget-instance-editor, etc."},
   {"id": "IV-F2", "verified": true, "note": "Verified via Work Log confirming PostEditor now mounts with key={ctx.params.postId}.", "causal_claim": "use-post-editor.hooks.ts has the identical unguarded shape"},
   {"id": "IV-F3", "verified": true, "note": "Owner explicitly marked as wontfix; purely cosmetic.", "causal_claim": "Contract-test comment cites @tiptap/extension-code-block where CodeBlockLowlight is registered"},
   {"id": "CX-F1 / GF-F1 / GP-F1", "verified": true, "note": "Verified via Work Log. Restored in ed72704 with safeImageSrc allowlist.", "causal_claim": "\"Img by URL\" produces content that can never render publicly"},
   {"id": "CX-F2", "verified": true, "note": "Premise refuted by owner; existing safeHref mitigates.", "causal_claim": "No evidence of URL-scheme validation for link/YouTube values; no adversarial matrix"},
   {"id": "CX-F3 / GP-F2", "verified": true, "note": "Fixed via remount strategy covering 3 more instances.", "causal_claim": "Effect-local cancelled flags cannot cancel a loader invoked from a post-mutation callback"},
   {"id": "CX-F4", "verified": true, "note": "Accepted risk by owner, remains test.fixme.", "causal_claim": "/m/{assetId}/public.v1/… 404s for 25s under the hermetic harness"},
   {"id": "CX-F5", "verified": true, "note": "Owner decided t stays at call sites.", "causal_claim": "Translate/DictionaryTranslator distinguished only by arity"},
   {"id": "GF-F2", "verified": true, "note": "Agent stopped mid-task; genuinely still open.", "causal_claim": "No AST depth/node-count bound before synchronous renderDocNode traversal"},
   {"id": "GF-F3", "verified": true, "note": "Rejected as an explicit non-goal.", "causal_claim": "useSettingsContainer left unmigrated"}
 ],
 "findings": [
   {
     "id": "F1",
     "severity": "blocker",
     "in_scope_domain": "3. Silent content loss or corruption",
     "diff_causal_link": "Diff causality tied to the mention links fix (ffd6a15) and YouTube raw draft preview fix (62314b9), as the interaction involves modifying atoms updated in this diff.",
     "rationale": {
       "checked": "Validation section explicitly listing a known caveat regarding data persistence.",
       "expected": "Inserting a mention after a YouTube atom should preserve both nodes in the document body.",
       "observed": "Inserting a mention immediately after a still-selected YouTube atom silently deletes the YouTube node from the persisted bodyJson.",
       "why_it_matters": "This is a direct violation of Domain 3. Operators silently lose authored content without any error or warning between the editor and the saved state.",
       "recommended_fix": "Investigate Tiptap's transaction logic during node insertion when an atom is selected to ensure it appends rather than destructively overwriting the selection.",
       "confidence": "high"
     }
   },
   {
     "id": "F2",
     "severity": "high",
     "in_scope_domain": "3. Silent content loss or corruption",
     "diff_causal_link": "Commit 6d3e9c4 adding `key=` to all 7 editor mounts in panels.tsx.",
     "rationale": {
       "checked": "Open Question 3 analyzing the `key=` remount strategy.",
       "expected": "Navigating away from an editor with unsaved changes should warn the user or preserve the state.",
       "observed": "Forcing a component remount via a changing `key=` prop destroys the component instance instantly on navigation, discarding local editor state.",
       "why_it_matters": "Operators can lose significant in-progress work simply by switching tabs or navigation panels accidentally, causing silent data loss on the client side.",
       "recommended_fix": "Implement a dirty-state navigation guard (e.g., `beforeunload` listener or router block) to warn the user before navigating away from unsaved changes.",
       "confidence": "medium"
     }
   },
   {
     "id": "F3",
     "severity": "medium",
     "in_scope_domain": null,
     "diff_causal_link": "Commits 62314b9 and ed72704 implementing the safeImageSrc allowlist.",
     "rationale": {
       "checked": "Open Question 2 analyzing the safeImageSrc regex allowlist.",
       "expected": "safeImageSrc must strictly validate the URL structure and hostname to prevent unintended internal resolutions.",
       "observed": "Regex-based URL allowlists can frequently be bypassed using userinfo segments (https://admin-site.com@evil.com) or punycode homographs.",
       "why_it_matters": "While the fetch occurs on the reader's browser, a crafted URL could facilitate Blind SSRF (intranet scanning) or trigger state-changing requests if an authenticated admin views the public page.",
       "recommended_fix": "Use the standard `new URL(src)` constructor to extract and validate the `hostname` and `protocol` programmatically instead of relying on regex matching.",
       "confidence": "medium"
     }
   },
   {
     "id": "F4",
     "severity": "medium",
     "in_scope_domain": null,
     "diff_causal_link": "Commits 5a04613, 6877d68, 761701e, 3cdb430, 5209ad4 completing the lib/fetch-query migration.",
     "rationale": {
       "checked": "Open Question 1 concerning invariant I5 validation gaps.",
       "expected": "The diff refactoring ~62 hook files should be proven behaviour-preserving via comprehensive test execution.",
       "observed": "The I5 territory was never exercised due to test harness constraints, leaving a significant evidence gap regarding silent behavioural drift.",
       "why_it_matters": "Silent behavioral changes in core functionalities like form submission, media processing, or comments could exist and pass static checks.",
       "recommended_fix": "Run the full E2E suite and apply mutation testing to the migrated `fetch-query` architecture to verify behaviour parity.",
       "confidence": "high"
     }
   }
 ],
 "out_of_scope_fatal_warnings": [],
 "score": 7.5,
 "score_rationale": "Score reduced below 8.5 due to a validated blocker (silent data loss of YouTube nodes upon mention insertion) and a high-risk potential regression causing dropped unsaved work on remounts; resolving these would raise the score to 10.",
 "blocking_gate": "FAIL",
 "closure": "COVERAGE_COMPLETE — round-2 coverage finished under TM-TOVU-2026-08-12-A"
}
```

### What should stay unchanged
- **The handwritten server renderer (`render.ts`):** Using a dedicated server-side rendering pipeline instead of relying on Tiptap's DOM serializer for public HTML is a highly resilient architectural choice. It establishes a strong, central choke point for sanitization, ensuring adherence to Invariant I1.
- **The `siteUrl()` absolute path wrapper:** The fix introduced in `ffd6a15` (wrapping the preview URL in `siteUrl()`) correctly prevents base URI hijacking in the `SrcDocSandbox`, ensuring relative links do not inadvertently adopt the admin origin.
- **Hook complexity ceilings:** The aggressive extraction of branching logic to top-level exported functions to maintain a < 9/9 complexity score significantly improves the testability and maintainability of the codebase.

### NOTES-mode file-level guidance
- **`apps/admin/src/panels.tsx`:** While mounting the 7 editors with `key=` cleanly resolves the stale-response mutation bug, it introduces a severe risk of unprompted data loss upon navigation. Pair this remount strategy with a dirty-state navigation guard (e.g., a React Router `Prompt`, a custom navigation blocker, or a native `beforeunload` event listener) to explicitly warn operators before discarding their unsaved `bodyJson` state.
- **`apps/admin/src/features/posts/PostEditor.tsx`:** Address the YouTube node deletion bug by auditing the Tiptap transaction dispatched when inserting a mention. If a block or inline atomic node (like YouTube) is currently selected, inserting a new node might be destructively overwriting the selection instead of appending it. You may need to define a custom command that manually sets the cursor position immediately after the selected atom prior to inserting the mention.
- **`src/server/http/site/render.ts`:** Refactor the `safeImageSrc` allowlist to avoid string/regex parsing. Use the native `URL` constructor (`new URL(src)`) to reliably parse the address, and then apply allowlist logic directly to `url.protocol` and `url.hostname`. This eliminates entire classes of URL parsing confusion attacks (e.g., userinfo `@` bypasses and malformed path resolutions).
- **`apps/admin/src/features/{widgets,menus}/hooks/*.hooks.ts`:** To properly close the evidence gap identified in Open Question 1 regarding the `lib/fetch-query` migration (I5), mandate a full end-to-end test run against these endpoints to guarantee that the React Query refactoring did not silently alter payload structures or component lifecycles.
