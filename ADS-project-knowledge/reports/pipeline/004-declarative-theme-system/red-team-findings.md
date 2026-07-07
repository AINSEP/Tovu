# Red-Team Findings: declarative-theme-system

- Feature: FEAT-004-declarative-theme-system
- Spec version: 1.0.0
- Spec hash: sha256:03d4a4aab5aecb5a270219522e17bb7644e8df90c60118d707e1f1d5009ce727
- Red-Team completed: 2026-07-07T04:40:00Z
- Red-Team agent: Claude Opus 4.8 (persona `AI-Dev-Shop/agents/red-team/skills.md` loaded this session)
- Finding count: 0 BLOCKING · 4 ADVISORY · 1 CONSTITUTION_FLAG

---

## BLOCKING Findings

None. Template resolution, discovery precedence, activation guarding, and render fallback are deterministic and falsifiable. Cleared for Software Architect. The CSS-sanitization item (RT-001 / RT-005) is the one worth deciding before the Architect.

---

## ADVISORY Findings

### RT-001
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: REQ-06, errors.spec.md §3 (`CSS_FORBIDDEN`), behavior.spec.md §7
- Description: CSS sanitization is specified as a **denylist of three patterns** (`@import`, external `url()`, `javascript:` URLs). Themes are untrusted third-party content and CSS is a real attack/exfiltration surface, so a three-item denylist is fragile. Notable gaps: `url(data:image/svg+xml,...)` (SVG-in-data-URL can carry script — the SVG-as-asset rule sanitizes `.svg` files "as text" but doesn't clearly cover inline `data:` SVG in CSS); `@font-face { src: url(...) }` external fetch; and historically dangerous constructs (`expression()`, `-moz-binding`) that a positive allowlist would exclude by default.
- Suggested resolution: Specify CSS sanitization as a **positive allowlist** of permitted at-rules/properties/functions, and explicitly decide the `url(data:...)` policy (recommend: forbid `data:` in CSS entirely in v1, or allow only `data:` for raster image types after content-sniffing). This is the highest-value hardening in the package; see RT-005 for the build-vs-adopt angle.

### RT-002
- Severity: ADVISORY
- Category: untestable
- Location: feature.spec.md Success Signal ("render pixel-equivalent") vs AC-01
- Description: The success signal claims built-ins "render **pixel-equivalent**," but no AC verifies pixels. AC-01 asserts CSS custom properties match and structure is preserved — that is *token/structure*-equivalence, which can diverge from pixel-equivalence (font rendering, box model, cascade order). "Pixel-equivalent" is not automatable without visual-regression tooling that isn't in scope.
- Suggested resolution: Downgrade the success-signal wording to "token- and structure-equivalent" to match AC-01, OR add an explicit visual-regression AC (and the tooling to scope). Recommend the wording fix — AC-01 is the right, testable bar.

### RT-003
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: REQ-10 / BR-06 (render fallback), INV-05
- Description: The render fallback resolves a failed active theme to the built-in `paper` and guarantees "never 5xx for theme-data reasons" (INV-05). But the spec assumes `paper` itself always loads. If the runtime's built-in `paper` package is itself missing/corrupt (bad build, partial install), the fallback target fails and INV-05 is violated — there is no last-resort.
- Suggested resolution: Specify a code-level last-resort shell (minimal hardcoded HTML, no theme data) used if even the built-in fallback fails to load — this is what actually makes INV-05 absolute. One rule in BR-06.

### RT-004
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-04 / EC-08 (component props)
- Description: EC-08 covers **unknown** props (ignored) and **missing** props (defaulted), and says rendering "never throws." It does not cover **present-but-wrong-type** props (e.g. a component expecting `title: string` given `title: { }`). "Never throws" implies coercion or ignore, but the behavior is unspecified, and props are not schema-validated in v1 (OQ-04).
- Suggested resolution: Extend EC-08: a present-but-wrong-type prop is treated as missing (defaulted) and never throws — making the "never throws" guarantee complete without needing prop schemas in v1.

---

## CONSTITUTION_FLAG Findings

### RT-005
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article VI — Security-by-Default (and Article I — Library-First)
- Location: REQ-06 CSS sanitization (the owned security-critical code)
- Description: The CSS sanitizer is the security boundary for untrusted theme content (Art. VI) and is also custom code where mature libraries exist (`postcss` + a sanitizing plugin; `DOMPurify` for the SVG-in-CSS/data-URL vector) (Art. I). feature.spec.md pre-justifies owning it ("security-critical, ADR-010 names it as owned code"). Owning a security parser is a legitimate but high-risk choice: hand-rolled CSS/SVG sanitizers are a classic source of bypasses.
- Architect note: Prepare a joint Art. VI + Art. I justification. Strongly consider adopting a vetted CSS-parsing library for tokenization and layering the allowlist (RT-001) on top, rather than a from-scratch string sanitizer — a regex denylist over CSS is the pattern that gets bypassed. Decide before Programmer; this is the package's top risk.

---

## Routing Decision

`0` BLOCKING findings. **Spec cleared for Software Architect dispatch.**

RT-001 + RT-005 (CSS sanitization: allowlist + build-vs-adopt) are the one thing worth a human/Architect decision before Programmer — it's the security boundary of the whole ecosystem surface. RT-002 (wording) and RT-003/RT-004 (fallback-of-fallback, wrong-type props) are cheap tightenings the Spec Agent can apply.
