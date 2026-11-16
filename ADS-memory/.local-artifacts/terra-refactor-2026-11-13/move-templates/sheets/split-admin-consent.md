# admin/features/consent (W1 #38, level 3): 4 slices; slice 1 READY, slices 2-3 BLOCKED (owner), slice 4 PARTIAL (Opus fill owed)
Written 2026-11-16 from Tovu b28d38c6 / Jini b7666092 (refactor/terra); skeleton by make-sheet.py. CLASSIFY tier: Opus:1 Sonnet:3; 2,308 loc.
kind: SPLIT (label; SPLIT 2026 / UI 196 / MOVE 86). Per file (blobs at b28d38c6):
  - rules.ts (9faf4329dcd884a54917643762a61f29e606bf43, 80 loc): only the preview scale is generic -> slice MV-admin-consent-1 READY. CONSENT_TAB_IDS, resolveConsentTabId, isConsentConflict (Tovu ApiError), FIELD_TABS, consentProblemTab, CATEGORY_ORDER, pausedByCategory, ConsentSaveState, consentStatusKey, canPublishConsent, canResetConsentCss STAY (page product rules) this wave.
  - consent-dictionary.ts (0cf536e2d73232c823e9c5ef3f3fada4bc2a6347, 1,946 loc): survey -> new `consent-i18n.ts` in `@jini-ai/admin/consent/react`, host `dictionary` prop stays an override. BLOCKED on owner question Q-I18N (below). 0 "tovu" hits; it binds Tovu's `COMMON_I18N` + `createDictionaryTranslator`.
  - use-consent-page.hooks.ts (6f461fd5ee6b86854053e4b1f6af0098dbea04c5, 196 loc): survey -> generic debounced preview into `@jini-ai/ui/admin-widgets`, scale hook into `@jini-ai/admin/consent/react`. PARTIAL (slice 4), Opus fill owed: useConsentPreview's debounce + generation guard is the generic part; useConsentPage/useConsentReadiness STAY (ConsentRevisionsPort is Tovu's draft/publish protocol). After slice 1, `useConsentPreviewScale` could follow the scale into Jini, but it is a ResizeObserver hook and `@jini-ai/admin/consent/react` must not import `@jini-ai/ui` (COMMON rule 6): fine, it needs only react.
  - consent-autosave.ts (3236cde2dd06c65cdfdc1881f27ced39ac9a444a, 86 loc, label MOVE): survey -> `@jini-ai/ui/panel-kit` with host `saveDraft({config, expectedDraftId})`, a conflict predicate and a view type. BLOCKED: overlaps `useStandingDraftAutosave` already in panel-kit (hooks/use-standing-draft-autosave.hooks.ts); the right move may be a DEDUPE onto it rather than a second autosave primitive. Owner/Opus question Q-AS below.
untangle_overlap: C2.repoint.tsv:158 CookieConsent.tsx (@jini-ai/agentic agentHandle -> @jini-ai/core/agent-handles). Slice 1 edits ONE import line of CookieConsent.tsx (line 9, the "./rules" import) -> guard CookieConsent.tsx by exact text, not blob; it may run before wave B. Slices 2-4: execute after wave B merge.

owner question Q-I18N: may a Jini package ship translated default dictionaries (all locales Tovu has today, ~1.9k lines of consent copy) next to its components, with the host's `dictionary` prop as an override? Recommendation: YES for component chrome copy that names no product (rule 2 check passes today), but the Tovu-only `COMMON_I18N` keys it reuses must be inlined or passed in; otherwise STAY.
owner/Opus question Q-AS: consent autosave as a DEDUPE onto panel-kit `useStandingDraftAutosave` (preferred, no new primitive) or a new `createDraftAutosave` in panel-kit? Recommendation: DEDUPE; needs one Opus sheet with the behaviour diff (timers, conflict predicate, expectedDraftId).

## Slice MV-admin-consent-1 (T-MOVE): the desktop preview scale into @jini-ai/admin/consent/react
tovu_files:
  - apps/admin/src/features/consent/rules.ts | blob 9faf4329dcd884a54917643762a61f29e606bf43
  - apps/admin/src/features/consent/use-consent-page.hooks.ts | blob 6f461fd5ee6b86854053e4b1f6af0098dbea04c5
  - apps/admin/src/features/consent/CookieConsent.tsx | text-guarded (C2 lane): its line 9 text below must occur once
  - apps/admin/src/features/consent/__tests__/rules.unit.test.ts | blob e9bf1a71f5113ce04d798f5d28c152e0f77fdc34
jini guards: packages/admin/src/consent/react/preview-scale.ts must not exist; `rg -n "consentPreviewScale|CONSENT_PREVIEW_DESKTOP_WIDTH" packages/admin/src` prints nothing; packages/admin/src/consent/react/index.ts | blob 4502806234372aa25d9bb303be6def465cd2750d
jini_code (new file packages/admin/src/consent/react/preview-scale.ts):
```ts
/** The page width the Desktop preview lays out at. The consent banner switches to its phone layout
 * (a full-width sheet) at 480px and below, so a preview drawn at a narrow pane's own width would show
 * that phone sheet under a "Desktop" label instead of the corner card visitors see. */
export const CONSENT_PREVIEW_DESKTOP_WIDTH = 1024;

/** How far the desktop-width page is scaled down to fit the preview pane; never enlarged.
 * An unmeasured (0) pane keeps 1. @complexity O(1). */
export function consentPreviewScale({ paneWidth }: { paneWidth: number }, _optional: Record<string, never> = {}): number {
  return paneWidth > 0 ? Math.min(1, paneWidth / CONSENT_PREVIEW_DESKTOP_WIDTH) : 1;
}
```
jini_index (consent/react/index.ts): append after the last line "export type { ConsentPreviewWidth } from './settings-panel.hooks.js';": "export { CONSENT_PREVIEW_DESKTOP_WIDTH, consentPreviewScale } from './preview-scale.js';"
jini_tests (new file packages/admin/src/consent/react/__tests__/preview-scale.test.ts) — relocated from Tovu rules.unit.test.ts lines 92-102, assertions verbatim:
```ts
import { describe, expect, it } from 'vitest';
import { CONSENT_PREVIEW_DESKTOP_WIDTH, consentPreviewScale } from '../preview-scale.js';

describe('consentPreviewScale', () => {
  it('lays Desktop out above the engine phone breakpoint (480px) and fits it to the pane', () => {
    expect(CONSENT_PREVIEW_DESKTOP_WIDTH).toBeGreaterThan(480);
    expect(consentPreviewScale({ paneWidth: CONSENT_PREVIEW_DESKTOP_WIDTH / 2 })).toBe(0.5);
  });

  it('never enlarges, and an unmeasured pane keeps the natural size', () => {
    expect(consentPreviewScale({ paneWidth: CONSENT_PREVIEW_DESKTOP_WIDTH * 2 })).toBe(1);
    expect(consentPreviewScale({ paneWidth: 0 })).toBe(1);
  });
});
```
changeset: .changeset/admin-consent-preview-scale.md: `"@jini-ai/admin": minor` | "`@jini-ai/admin/consent/react` exports `consentPreviewScale` and `CONSENT_PREVIEW_DESKTOP_WIDTH` for a host's desktop preview pane."
jini_msg: "feat(admin): consent desktop preview scale"
Tovu edits:
  - rules.ts: delete the 10 lines from "/** The page width the Desktop preview lays out at. The engine's banner switches to its phone layout" through the closing "}" of consentPreviewScale (end of file), and the blank line before them; the file then ends with canResetConsentCss's closing "}\n". Check first: these are the last lines of the file (rg -n "consentPreviewScale" rules.ts shows line 79 and the file has 81 lines); else SKIP.
  - use-consent-page.hooks.ts: "import { canPublishConsent, consentPreviewScale, isConsentConflict, type ConsentSaveState } from './rules';" -> "import { consentPreviewScale } from '@jini-ai/admin/consent/react';\nimport { canPublishConsent, isConsentConflict, type ConsentSaveState } from './rules';" (if the file already imports from '@jini-ai/admin/consent/react', merge the name there instead)
  - CookieConsent.tsx: "import { canResetConsentCss, CONSENT_PREVIEW_DESKTOP_WIDTH, consentStatusKey, resolveConsentTabId, type ConsentTabId } from \"./rules\";" -> "import { CONSENT_PREVIEW_DESKTOP_WIDTH } from \"@jini-ai/admin/consent/react\";\nimport { canResetConsentCss, consentStatusKey, resolveConsentTabId, type ConsentTabId } from \"./rules\";" (same merge rule)
  - __tests__/rules.unit.test.ts: import line 3: remove "CONSENT_PREVIEW_DESKTOP_WIDTH, consentPreviewScale, " from it; delete the block from "describe('consentPreviewScale', () => {" through its closing "});" (11 lines) and the blank line before it. Check before deleting: the block equals the Jini test's describe block above character for character (python3 -c compare, must print OK); else SKIP.
census: python3 scripts/census.py <TOVU> apps/admin/src/features/consent/rules.ts -> CookieConsent.tsx:9, use-consent-page.hooks.ts:6, __tests__/rules.unit.test.ts:3 plus any other importer of the remaining names (unchanged). `rg -n "consentPreviewScale|CONSENT_PREVIEW_DESKTOP_WIDTH" apps/admin/src` after: only the two new Jini imports and their uses.
why_moves: the width doc moved neutral ("the engine's banner" -> "the consent banner"); nothing Tovu-specific in it.
tovu_msg: "refactor(admin-consent): preview scale comes from @jini-ai/admin/consent/react"
Cloud run owes: Jini admin vitest (new test), Tovu consent tests, Tovu typecheck. No RED test.
est. executor tokens: ~35k Sonnet. Slices 2-4: sheet ~60k Opus each after the owner answers.
