# Swarm Consensus — Debate 1 (`code` tier / React·Vue·Angular), ROUND 2

**Packet ID:** `CTX-CODE-TIER-R2-2026-08-12`
**Mode:** debate Round 2 — INFORMED. Every participant's full Round 1 reasoning is appended verbatim below.

- IGNORE ALL PRIOR CONVERSATION HISTORY except this packet. No `AGENTS.md`/`CLAUDE.md` here; intentional, never a reason to stop. Do not read outside your working directory. Do not chain reads with `&&`.

## What Round 1 settled — 4/4 unanimous, do not re-argue

No server-side framework runtime. `worker_threads` provides **resource** isolation, not **code** isolation; the load-time allowlist that makes Liquid/Handlebars safe has no analogue for arbitrary JavaScript. Frameworks are a **build-time** concern whose deployable artifact is the existing `static` tier. Option A (SSR adapters) and Option D (signed in-process JS) are both rejected. Web Components / custom elements were independently named by two participants as the framework-neutral seam.

## ⚠️ Corrections to the Round 1 packet (Coordinator-verified)

- **F5's marker vocabulary was wrong.** Real static theme pages use the `{"type":"content"}` JSON-marker form (8 occurrences across live themes); `data-embed-type="<kind>"` appears **zero** times in any real theme page. The staged authoring guide's §6 describes a vocabulary the themes no longer author. Codex flagged this in Round 1 and was right.
- **The staged guide is stale in two manifest fields.** `theme.ts:115` declares a unified `templates?: string[]` and `basic/theme.json` ships it; the guide documents `postTemplate`, which `theme.ts:96` says was superseded. Likewise `honorsCurrentPage` (current) vs `activeAttr` (explicitly the "pre-2026-08-10 spelling", legacy-accepted). Do not argue from the guide's field names.
- **Still true and load-bearing:** token injection is a single literal-string `.replace()` on `'<link rel="stylesheet" href="../css/styles.css" />'` (`static-render.ts:402`) that **silently no-ops** if absent; asset rewriting is hardcoded double-quoted `../css/` and `../js/` prefixes; `parseTier` silently coerces unknown tiers to `"declarative"`.

## The Round 2 ask — CONVERGE (no code this round; Round 3 produces code)

The runtime boundary is settled. Converge on what Round 1 left genuinely open:

1. **The build-lifecycle fork — the central unresolved question.** *Author builds locally* (safe; but authoring becomes edit-locally-then-upload, a different UX from every other tier) versus *Tovu runs the build* (keeps the in-product UX; imports npm supply-chain risk — arbitrary `postinstall`, compromised transitive deps — which this repo has zero machinery for, having not even shipped the CSS sanitizer ADR-010 asked for). Pick one and defend it. If you pick Tovu-runs-build, specify the containment.
2. **Source-vs-artifact reset semantics.** Copy-not-inherit and per-file "restore to pristine" are plain file copies today. What is a "file" the user resets when the served output is generated? Does the authored source ship in the package?
3. **AI-authorability.** `theme_write_file` re-validates and replaces live theme content per write. What does it do when the written file is source that requires a build, or output the next build overwrites?
4. **One class of theme or two?** Several Round 1 answers converged on declaring built themes a distinct class (opaque, versioned, replaced wholesale, editor-read-only) rather than pretending they behave like authored themes. Settle whether that split is the design or an admission of failure.
5. **Conformance.** Given the literal-string rewrites, what stops a bundler silently disabling token injection? Lint, conformance suite, or replace string-replace with a real parser — and who pays for touching the path serving 100% of live traffic?
6. **Web Components.** Two participants named it independently; one rated it weaker for whole-page authoring. Settle its role: whole-page seam, islands-only, or not now.
7. **Three frameworks or one first?** If one, which, and what qualifies the others.

State your current position, whether it changed this round and why, the strongest argument against the leading opposing position, and what would change your mind.

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-CODE-TIER-R2-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position And Movement`, `## The Build-Lifecycle Verdict`, `## Remaining Disagreements`, `## Strongest Counter-Argument`, `## What Would Change My Mind`.

End with exactly `<<SWARM_END>>` on its own line.

---

# APPENDIX — Every participant's full Round 1 response, verbatim

