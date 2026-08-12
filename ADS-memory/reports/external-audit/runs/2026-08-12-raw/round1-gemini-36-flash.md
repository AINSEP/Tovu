```json
{
  "threat_model_accepted": true,
  "rejection_reason": "",
  "auditor_scope_check": "Audited 78 commits (3a3907f..HEAD) across 241 files (+15,753 / -1,921) via the self-contained session audit packet for TM-TOVU-2026-08-12-A. Reviewed Work Log items 1–8, Key Files table, Validation results, and Threat Model scope contract. No scope mismatches detected.",
  "findings": [
    {
      "id": "F1",
      "severity": "low",
      "in_scope_domain": null,
      "rationale": {
        "checked": "apps/admin/src/lib/media-image-extension.tsx and src/server/http/site/render.ts",
        "expected": "Editor toolbar controls produce content nodes that either render faithfully on the public site or clearly indicate rendering constraints to the operator.",
        "observed": "The editor toolbar includes an 'Img by URL' option producing legacy image nodes with attrs.src, but src/server/http/site/render.ts intentionally ignores attrs.src to prevent untrusted/authenticated URL rendering, causing these nodes to degrade to visible placeholders.",
        "why_it_matters": "While fully compliant with Invariant I2 (it degrades to a visible placeholder rather than dropping silently or exposing unsafe URLs), it creates operator UX confusion when valid image preview URLs in the editor fail to render as images on the public site.",
        "recommended_fix": "Replace the 'Img by URL' toolbar action with a media library upload workflow, or show an inline warning banner in the editor node view when an unmanaged URL is used.",
        "confidence": "high"
      }
    },
    {
      "id": "F2",
      "severity": "low",
      "in_scope_domain": null,
      "rationale": {
        "checked": "src/server/routes/admin/posts/template-preview.ts and src/server/http/site/render.ts",
        "expected": "Unsaved preview request processing (up to 15MB payload) includes structural depth and node complexity bounds before tree parsing.",
        "observed": "The template preview POST route accepts up to 15MB bodyJson via express.urlencoded and passes it directly to synchronous renderDocNode tree traversal.",
        "why_it_matters": "Deeply nested or hostile Tiptap AST structures could cause elevated CPU consumption or event-loop micro-stalls during synchronous server-side rendering.",
        "recommended_fix": "Enforce a maximum AST depth limit (e.g., max depth 32) and maximum node count inside renderDocNode prior to traversal.",
        "confidence": "medium"
      }
    },
    {
      "id": "F3",
      "severity": "low",
      "in_scope_domain": null,
      "rationale": {
        "checked": "apps/admin/src/features/*/hooks/*.hooks.ts (useSettingsContainer)",
        "expected": "All admin container hooks leverage standardized server-state management via lib/fetch-query (TanStack Query wrapper).",
        "observed": "useSettingsContainer was intentionally skipped during the fetch-query migration due to dynamic operator-driven namespaces.",
        "why_it_matters": "Leaving useSettingsContainer on manual useState lifecycle handling creates an exception to the unified server-state architecture.",
        "recommended_fix": "Refactor useSettingsContainer to use TanStack Query's useQueries hook to dynamically map workspace namespaces into managed queries.",
        "confidence": "high"
      }
    }
  ],
  "out_of_scope_fatal_warnings": [],
  "score": 9.2,
  "score_rationale": "The refactor successfully satisfies all six mandatory invariants, resolves eight async race conditions and five silent-drop rendering bugs, but leaves minor UX friction in image URL rendering and dynamic settings loading.",
  "blocking_gate": "PASS"
}
```

---

## Audit Evaluation & Synthesis

### What Looks Solid and Should Stay Unchanged

1. **Public Renderer & Sanitization Layer ([`src/server/http/site/render.ts`](file:///src/server/http/site/render.ts))**
   - **Invariant I1 & I2 Compliance:** The strict whitelist approach in `renderDocNode` guarantees that operator-supplied values pass through CSS sanitizers (`safeCssColor`, `safeCssFontFamily`, `safeCssLength`) and bounded structural constraints (`colspan`/`rowspan`). Refusing raw `attrs.src` URLs on image nodes prevents stored XSS and SSRF/URL leaks. The resolution of the 5 silent-drop bugs (`textAlign`, `underline`, `strike`, `hardBreak`, `mention`) ensures complete fidelity or visible degradation.

2. **Media Context Resolution ([`src/widgets/resolver-service.ts`](file:///src/widgets/resolver-service.ts))**
   - Correctly fixes the ref-image degradation bug by threading `mediaTransformVersions` and `mediaAssetMetadata` through `resolvePostContentMediaContext` across both public page and preview rendering paths.

3. **Unsaved Template Preview Route ([`src/server/routes/admin/posts/template-preview.ts`](file:///src/server/routes/admin/posts/template-preview.ts))**
   - **Invariant I4 Compliance:** The preview path processes unsaved `bodyJson` purely in memory and passes it directly to `renderDocNode` without database transactions or storage persistence. Authorization parity (`content.read`) is strictly maintained.

4. **Async Race Guards Across Feature Hooks ([`apps/admin/src/features/*/hooks/*.hooks.ts`](file:///apps/admin/src/features/*/hooks/*.hooks.ts))**
   - **Invariant I3 Compliance:** Effect-local `cancelled` flags effectively prevent superseded asynchronous HTTP responses from committing state. Utilizing a monotonic request-id ref for multi-caller loaders ensures safety when data fetching is triggered from both effects and post-mutation callbacks.

5. **i18n & Dependency Injection Sweeps**
   - **Invariant I5 & I6 Compliance:** Disambiguating 1-arg (`Translate`) and 2-arg (`DictionaryTranslator`) translation signatures while binding `t` at the hook boundary successfully eliminated ~11 redundant per-screen `loadLanguage()` fetches without altering localized rendering output.

---

### File-Level Change Guidance (Notes Mode)

#### 1. [`apps/admin/src/lib/media-image-extension.tsx`](file:///apps/admin/src/lib/media-image-extension.tsx)
- **Context:** The editor toolbar currently allows operators to insert images via external URLs ("Img by URL").
- **Guidance:** Because the public renderer intentionally ignores unmanaged `attrs.src` strings, update `media-image-extension.tsx` to automatically trigger an ingest/upload into the workspace media library upon URL insertion, or render an explicit UI badge in the editor warning that external URL images require media library import to display publicly.

#### 2. [`src/server/routes/admin/posts/template-preview.ts`](file:///src/server/routes/admin/posts/template-preview.ts)
- **Context:** Endpoint accepts POST bodies up to 15MB containing unsaved Tiptap JSON.
- **Guidance:** Implement pre-render validation on incoming `bodyJson` payloads to reject excessively deep tree structures (e.g., depth > 32) or total node counts exceeding reasonable operational limits (e.g., > 10,000 nodes) prior to invoking `renderDocNode`.

#### 3. [`apps/admin/src/features/settings/hooks/use-settings-container.ts`](file:///apps/admin/src/features/settings/hooks/use-settings-container.ts)
- **Context:** Unmigrated hook handling dynamic operator namespaces.
- **Guidance:** Migrate the dynamic namespace loading logic to use TanStack Query's `useQueries` primitive wrapped inside `lib/fetch-query`. This unifies cache invalidation semantics across all admin features.
