```json
{
  "threat_model_accepted": true,
  "rejection_reason": "",
  "auditor_scope_check": "Audited the self-contained work-log covering 78 commits (3a3907f..HEAD) across 241 files on branch 'general-work'. Evaluated editor expansion, DI/i18n sweeps, fetch-query migration, preview POST route, and race condition fixes against Threat Model TM-TOVU-2026-08-12-A. No repository access was used; relied strictly on the provided artifact summaries.",
  "findings": [
    {
      "id": "F1",
      "severity": "low",
      "in_scope_domain": null,
      "rationale": {
        "checked": "Public renderer trust of attrs.src on legacy images (Open Question 1)",
        "expected": "Editor controls produce content that can render on the public site without breaking UX",
        "observed": "The 'Img by URL' control creates nodes that deliberately miss the render path and fall back to placeholders",
        "why_it_matters": "Creates a confusing operator UX where preview/public output consistently fails to match the editor input. It safely degrades per I2, making it an advisory UX finding rather than a blocker.",
        "recommended_fix": "Remove the 'Img by URL' control from the toolbar entirely, forcing all image inserts through the supported secure upload flow.",
        "confidence": "high"
      }
    },
    {
      "id": "F2",
      "severity": "low",
      "in_scope_domain": null,
      "rationale": {
        "checked": "Stale-response race condition fixes (Open Question 3)",
        "expected": "All concurrent loader invocations are cleanly superseded by newer navigations",
        "observed": "While the known two-call-site loader uses a monotonic request-id, others rely on effect-local `cancelled` flags which cannot cancel invocations from post-mutation callbacks",
        "why_it_matters": "If a single-call-site loader is ever reused in a mutation callback in the future, the effect-local flag will silently fail to protect it against races. There is no concrete evidence of a current I3 violation, making this advisory.",
        "recommended_fix": "Standardize on monotonic request-id refs for all state-committing async loaders, regardless of their current call-site count.",
        "confidence": "high"
      }
    }
  ],
  "out_of_scope_fatal_warnings": [],
  "score": 9,
  "score_rationale": "The refactor successfully closes multiple silent data-drop bugs and complex race conditions without violating security invariants, significantly improving structural integrity.",
  "blocking_gate": "PASS"
}
```

### Score Breakdown
**What reduced the score:** 
- The UX dead-end where the "Img by URL" control produces nodes that deliberately fail to render.
- The fragile reliance on effect-local `cancelled` flags for loaders, which is mathematically insufficient if those loaders are ever called outside of effects (e.g. post-mutation).
- Flaky test infrastructure (the hermetic 25s 404 test) and unaddressed `TS2348` typing technical debt.

**What would raise it to 10 (Advisory):**
- Removing the "Img by URL" control to harmonize editor capability with the public renderer.
- Standardizing all async race-guards to use monotonic request-ids.
- Isolating and fixing the root cause of the `test.fixme` hermetic timeout.
- Resolving the legacy typing errors.

---

### What Looks Solid
- **Public Renderer Enforcement:** Consolidating sanitization and node rendering into `renderDocNode` and forcing the preview route to use the exact same server-side renderer is structurally sound. It guarantees Invariants 1 and 2 are enforced uniformly without duplicating sanitization logic across the client and server.
- **Complexity Sweeps:** Extracting branching logic to top-level exported functions in `features/*/rules.ts` is an excellent pattern. It isolates pure logic from the React lifecycle, naturally resolving hook complexity limits while making business rules trivially unit-testable.
- **Race Condition Mitigations:** The independent audit and subsequent fix of the 8 stale-response races demonstrates rigorous state management. Transitioning away from hand-rolled `useState` triples to a vendor-neutral fetch wrapper drastically reduces the surface area for future race conditions.

### File-Level Change Guidance (Notes Mode)

**`src/server/http/site/render.ts` & `src/server/routes/admin/posts/template-preview.ts`**
- *Note on Preview POST (Open Question 2):* Because both paths funnel through `renderDocNode`, the sanitization equivalence holds and Invariant 1 is satisfied. However, allowing `express.urlencoded({limit:"15mb"})` creates a massive parsing surface. Ensure your Express stack is configured to reject deeply nested objects (e.g., setting depth limits on `qs`) to prevent event-loop blocking from maliciously crafted or malformed URL-encoded JSON payloads.

**`apps/admin/src/features/*/hooks/*.hooks.ts`**
- *Note on Effect-Local Flags (Open Question 3):* Effect-local `cancelled` flags are mathematically insufficient if a loader is invoked from both an effect and a post-mutation callback, because the mutation callback has no reference to the effect's local flag. While you patched the known dual-site loader with a monotonic request-id, you should proactively adopt monotonic request-ids as the standard pattern for *all* async loaders. This prevents silent regressions when a developer inevitably adds a mutation callback to a currently "safe" single-site loader.

**`apps/admin/src/lib/fetch-query/{index,types}.ts`**
- *Note on Type Distinctions (Open Question 4):* Relying on arity for TypeScript type distinction (`Translate` vs `DictionaryTranslator`) works functionally at compile time but is structurally brittle. If these functions are ever passed generically or if default arguments are introduced, the distinction collapses. Consider using a branded type or attaching a distinct symbol property if you need robust contract differentiation.
