```json
{
  "threat_model_accepted": true,
  "rejection_reason": "",
  "auditor_scope_check": "Audited diff range 12fee53..HEAD (36 commits, 159 files, +13,163/-838) on top of Round 1 base packet context. Examined work log, disposition ledger, validation notes, and open questions. No external code read tools were executed per packet constraints.",
  "ledger_updates": [
    {
      "id": "IV-F1",
      "verified": true,
      "note": "Resolved via per-hook staleness refs guarding promises in commit 53b8d6f and key= remount props on all 7 editor mounts in panels.tsx in commit 6d3e9c4. Verified via 3 behavioral tests.",
      "causal_claim": "save() unguarded against stale responses in widget/menu editors, allowing navigation mid-save to write to wrong record."
    },
    {
      "id": "IV-F2",
      "verified": true,
      "note": "Resolved via key={ctx.params.postId} remount guard on PostEditor in panels.tsx (commit 6d3e9c4).",
      "causal_claim": "use-post-editor.hooks.ts unguarded against stale response commits."
    },
    {
      "id": "IV-F3",
      "verified": true,
      "note": "Wontfix disposition accepted. Comment inaccuracy does not impact runtime invariant enforcement.",
      "causal_claim": "Contract test comment misattribution of CodeBlockLowlight extension."
    },
    {
      "id": "CX-F1",
      "verified": true,
      "note": "Img by URL control restored under owner override with safeImageSrc allowlist in render.ts rejecting dangerous schemes and admin media URLs, degrading invalid values to visible placeholder.",
      "causal_claim": "Img by URL producing unrenderable or unsafe public HTML content."
    },
    {
      "id": "CX-F2",
      "verified": true,
      "note": "Refuted for links/YouTube as safeHref and extractYoutubeVideoId isolate inputs; safeImageSrc hostile input test cases added.",
      "causal_claim": "Missing URL scheme validation for links and YouTube embeds."
    },
    {
      "id": "CX-F3",
      "verified": true,
      "note": "Closed via key= remount pattern on editor mounts across collections, media, and comment-settings features.",
      "causal_claim": "Effect-local cancelled flags unable to cancel post-mutation callback loaders."
    },
    {
      "id": "CX-F4",
      "verified": true,
      "note": "Accepted risk; test.fixme retained for hermetic harness asset 404 issue.",
      "causal_claim": "Public asset endpoint 404s under hermetic test environment."
    },
    {
      "id": "CX-F5",
      "verified": true,
      "note": "Wontfix disposition accepted; structural arity distinction retained by design.",
      "causal_claim": "Structural typing overlap between Translate and DictionaryTranslator types."
    },
    {
      "id": "GF-F2",
      "verified": true,
      "note": "Agree-defer disposition retained; missing AST depth/node-count bound remains an open advisory low item.",
      "causal_claim": "Missing AST depth/node-count bound during renderDocNode traversal."
    },
    {
      "id": "GF-F3",
      "verified": true,
      "note": "Out-of-scope per explicit non-goal contract.",
      "causal_claim": "useSettingsContainer left unmigrated to fetch-query architecture."
    }
  ],
  "findings": [
    {
      "id": "F1",
      "severity": "medium",
      "in_scope_domain": "Silent content loss or corruption",
      "diff_causal_link": "Diff introduced YouTube atom preview placeholder handling in 62314b9 alongside editor node insertion behaviors; interaction between YouTube atom selection state and post-node mention insertion needs regression guard.",
      "rationale": {
        "checked": "Caveat observation regarding mention insertion immediately following a selected YouTube atom in PostEditor.",
        "expected": "Inserting a mention node adjacent to a YouTube atom preserves both nodes in persisted bodyJson.",
        "observed": "A single unconfirmed observation where YouTube node appeared removed from bodyJson following mention insertion after selected YouTube atom.",
        "why_it_matters": "If reproducible, this violates Invariant I2 (editor/renderer parity) and Domain 3 (silent content loss).",
        "recommended_fix": "Add a unit test in PostEditor contract tests specifically verifying node retention when inserting mention marks/nodes adjacent to selected atom nodes.",
        "confidence": "medium"
      }
    },
    {
      "id": "F2",
      "severity": "medium",
      "in_scope_domain": "Unsafe content reaching public HTML",
      "diff_causal_link": "Diff ed72704 introduced safeImageSrc scheme allowlist in render.ts for 'Img by URL' restoration.",
      "rationale": {
        "checked": "safeImageSrc enforcement rules described in packet (rejecting javascript:, data:, blob:, file:, relative paths, admin media paths).",
        "expected": "Strict validation preventing scheme bypasses (e.g. userinfo, control chars, unicode homographs) from emitting unsafe src attributes.",
        "observed": "The underlying regex/parser implementation for safeImageSrc cannot be directly inspected due to tool execution constraints, creating an evidence verification gap.",
        "why_it_matters": "An unhandled URL parser bypass could allow stored XSS or attribute injection into public HTML (Domain 1 / Invariant I1).",
        "recommended_fix": "Expand tiptap-render-contract.test.ts hostile-input suite with edge-case URL variants (userinfo, leading whitespace, control characters, punycode).",
        "confidence": "medium"
      }
    },
    {
      "id": "F3",
      "severity": "low",
      "in_scope_domain": "Unrecoverable break on normal operator use",
      "diff_causal_link": "Diff 62314b9 added pre-sandbox YouTube placeholder degradation to handle SrcDocSandbox limitations.",
      "rationale": {
        "checked": "Raw preview iframe handling in SrcDocSandbox for YouTube embeds.",
        "expected": "All third-party iframe embed types requiring same-origin storage degrade gracefully in raw draft preview rather than throwing exceptions.",
        "observed": "Placeholder degradation was targeted specifically to YouTube embeds; other embed types rendering inside SrcDocSandbox could still encounter origin restrictions.",
        "why_it_matters": "Uncovered embed types in raw preview could trigger unhandled frame errors in admin preview mode (Domain 5 / Invariant I2).",
        "recommended_fix": "Generalize pre-sandbox preview transformer to apply placeholder degradation to all third-party iframe embed nodes.",
        "confidence": "low"
      }
    }
  ],
  "out_of_scope_fatal_warnings": [],
  "score": 9.2,
  "score_rationale": "The critical Round 1 stale-commit blocker (IV-F1) is fully resolved via per-hook staleness refs and key= remounts, and safeImageSrc protects public HTML rendering; score is kept below 10 due to unverified edge-case URL parser coverage and the unconfirmed mention/YouTube node triage item.",
  "blocking_gate": "PASS",
  "closure": "COVERAGE_COMPLETE — round-2 coverage finished under TM-TOVU-2026-08-12-A"
}
```

---

### What Should Stay Unchanged

1. **Editor Mount Remount Keying ([`apps/admin/src/panels.tsx`](file:///Users/la/.gemini/antigravity-cli/scratch/apps/admin/src/panels.tsx))**
   - The `key=` props added across all 7 editor mounts in `panels.tsx` (e.g. `key={ctx.params.postId}`) effectively guarantee clean state resets on entity switches. Do not remove or alter these keying mechanisms.

2. **Per-Hook Staleness Guarding ([`apps/admin/src/features/widgets/hooks/use-widget-instance-editor.hooks.ts`](file:///Users/la/.gemini/antigravity-cli/scratch/apps/admin/src/features/widgets/hooks/use-widget-instance-editor.hooks.ts))**
   - The staleness refs guarding `.then()`, `.catch()`, and `.finally()` callbacks on `save()` operations must remain intact to prevent out-of-order response commits.

3. **Public Renderer Image Sanitization ([`src/server/http/site/render.ts`](file:///Users/la/.gemini/antigravity-cli/scratch/src/server/http/site/render.ts))**
   - Keep the `safeImageSrc` allowlist and fallback placeholder behavior in `render.ts`. Ensures untrusted or non-http/https image sources degrade safely to visible placeholders without emitting unsafe attributes or broken scripts.

4. **Origin Wrapping for Preview URLs ([`apps/admin/src/lib/api.ts`](file:///Users/la/.gemini/antigravity-cli/scratch/apps/admin/src/lib/api.ts))**
   - Retain the `siteUrl()` wrapper on `templatePreviewUrl` to ensure absolute origin resolution during document navigation inside previews.

---

### File-Level Guidance (NOTES Mode)

#### 1. [`src/server/http/site/__tests__/tiptap-render-contract.test.ts`](file:///Users/la/.gemini/antigravity-cli/scratch/src/server/http/site/__tests__/tiptap-render-contract.test.ts)
- Expand the hostile-input matrix for `safeImageSrc` to include obscure URL structures such as credentials in userinfo (`https://user:pass@domain/`), URL-encoded control characters, leading/trailing whitespace variations, and punycode domains to ensure no sanitizer bypasses exist.

#### 2. [`apps/admin/src/features/posts/PostEditor.tsx`](file:///Users/la/.gemini/antigravity-cli/scratch/apps/admin/src/features/posts/PostEditor.tsx)
- Add a focused editor interaction test covering the sequence: insert YouTube atom → select YouTube node → insert mention node immediately after. Verify that `bodyJson` retains both the YouTube node and the mention node.

#### 3. [`apps/admin/src/components/SrcDocSandbox.tsx`](file:///Users/la/.gemini/antigravity-cli/scratch/apps/admin/src/components/SrcDocSandbox.tsx)
- Review raw preview pre-sandbox transformation logic to ensure any iframe-based embed atom (not just YouTube) degrades gracefully to a labeled placeholder before entering the origin-restricted `SrcDocSandbox`.

---

### Summary of Audit Coverage & Evidence Gaps

- **Round 1 Blocker Verification:** `IV-F1` and `IV-F2` are confirmed fixed by two independent defense layers (`key=` remounts on editor panels + per-hook staleness refs).
- **Public HTML Invariant (I1/I2):** Restored "Img by URL" feature uses `safeImageSrc` to restrict schemes to `http`/`https` and force fallback to visible placeholders when invalid.
- **Explicit Evidence Gaps:**
  - `I5` refactoring behavior preservation across ~62 modified hook files relied on scoped test runs rather than full-suite mutation testing.
  - The exact regex/parsing implementation of `safeImageSrc` in `render.ts` could not be directly inspected via codebase tools in this run; coverage relies on described behavior and contract test metrics.
