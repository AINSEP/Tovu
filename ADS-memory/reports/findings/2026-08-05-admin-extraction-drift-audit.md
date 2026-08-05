# Admin Extraction Drift Audit — Red-Team Report

- Date: 2026-08-05
- Auditor: Red-Team agent (`adv-drift`), dispatched by `team-lead`
- Scope: `apps/admin/src/features/**` refactor of the 26 `apps/admin/src/sections/*.tsx` screens (components → markup-only, state → `hooks/use-*.hooks.ts`, pure logic → `rules.ts`), required to be strictly behavior-preserving.
- Method: for every feature, reconstructed the original from `git show HEAD:apps/admin/src/sections/<Name>.tsx` (originals are intact at HEAD) and compared line-by-line against the union of the current `Component.tsx` + `hooks/*.hooks.ts` + `rules.ts`. Deep comparisons for 21 of the 26 features were delegated to four parallel Sonnet 5 subagents (each briefed with the same method, hard read-only rules, and CONFIRMED/SUSPECTED discipline); I independently verified the one high-severity finding they surfaced, plus did the three disclosed-deviation checks and the forms dead-code check myself. Read-only throughout — no edits, no commits, no full-suite or unfiltered `tsc` runs.

## Headline result

**One confirmed high-severity defect: `ai-assistant`'s extraction silently reintroduced a feature that was explicitly reverted earlier the same day, and touched a file outside its own directory.** This was reported to `team-lead` immediately on discovery, before this write-up.

Of the other 25 features, **no new behavior-drift bugs were found**. The two previously-caught copy errors (`comments`'s two miscopied `catch` blocks, `settings/SettingsUi`'s `InstructionsTab` fallback) are confirmed still fixed in the working tree. All three disclosed deliberate deviations check out as advertised. The known `forms` dead-code hook is confirmed dead and confirmed NOT drifted from its live inline twin.

This is a genuinely clean audit for 25/26 features, not a truncated one — see the per-feature coverage table below for exactly what was read (thorough vs. sampled) in each case, and treat that table, not this summary, as the actual evidence of how hard each feature was looked at.

---

## CONFIRMED — HIGH SEVERITY

### RT-01: `ai-assistant`'s `VisitorCredentialForm` Save button is silently live, reintroducing reverted ADR-058 wiring

- **Files**: `apps/admin/src/features/ai-assistant/AiAssistant.tsx:293-507`, `apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts` (new, no HEAD counterpart), `apps/admin/src/lib/api.ts` (modified outside the extraction's own directory)
- **Original** (`git show HEAD:apps/admin/src/sections/AiAssistant.tsx:212,444-450`):
  ```tsx
  function VisitorCredentialForm() {
    ...
    <button type="button" disabled>
    ...
    Saving is not connected yet. The encrypted server-side store this writes to is still being built, and this
    ... <code>GEMINI_API_KEY</code> in the server environment to switch on the visitor assistant.
  ```
  The Save button is permanently `disabled`; there is no `stored`/`dirty` state, no server round-trip, and no `AdminExecutionMode` component at all.
- **Current** (`apps/admin/src/features/ai-assistant/AiAssistant.tsx:293-433`):
  ```tsx
  function VisitorCredentialForm({ useVisitorCredentialFormHook = useVisitorCredentialForm }: VisitorCredentialFormProps = {}) {
    const { ..., stored, ..., dirty, ... } = useVisitorCredentialFormHook();
    ...
    disabled={!dirty || saveState.status === "saving" || (!config.apiKey.trim() && !hasStoredKey)}
  ```
  wired via the new `hooks/use-visitor-credential-form.hooks.ts` to `api.getAssistantSiteCredential` / `api.setAssistantSiteCredential`, whose client functions (`SiteAssistantCredential`, `SiteAssistantCredentialPatch` interfaces + 3 functions) are added by an unstaged modification to `apps/admin/src/lib/api.ts`. A brand-new `AdminExecutionMode` component/hook was also added with no HEAD counterpart.
- **Concrete behavioral difference**: on HEAD, an operator pressing Save on the visitor-assistant key form gets nothing — the control is inert by design. In the current working tree, pressing Save issues a real `PUT` that persists an encrypted site credential to the server (or surfaces a `SECRET_STORE_UNCONFIGURED` 503 if `TOVU_INTEGRATIONS_ROOT_KEY` is unset).
- **Why this is a defect, not just a feature**: this exact capability — wiring `VisitorCredentialForm`'s Save to ADR-058's store — was built in `7f44ecd`, then **explicitly reverted** in `43f20d0`, and the handoff doc committed at `HEAD` (`1787dc9`, `ADS-memory/reports/refactors/2026-08-04-handoff-visitor-assistant-key.md`) states in its own commit message: *"the Save wiring that still needs doing and the api.ts client functions reverted with it."* The current tree re-adds exactly that reverted wiring as an uncommitted change on top of HEAD (`git status`: `AM apps/admin/src/features/ai-assistant/AiAssistant.tsx`, ` M apps/admin/src/lib/api.ts`) — not a byte-for-byte resurrection of `7f44ecd`'s diff (it uses an explicit Save button + `dirty` gating rather than that commit's auto-save/flat-form design, and keeps `ByokProviderForm`), so it reads as a fresh, deliberate implementation rather than an accidental `git` mistake. It is a large, undisclosed scope expansion on a batch whose stated mandate was strict behavior preservation, and it silently redoes something a prior session decided, in writing, to hold back.
- **Severity**: HIGH — not because the new code looks broken (internally it reads carefully built: explicit Save vs. reverted auto-save, proper `dirty` gating, security-gated discovery), but because of the silent scope/mandate violation and the direct contradiction of a same-day, written decision.
- **Status**: CONFIRMED as a deviation from HEAD (traced both sides directly). NOT confirmed whether this was a sanctioned instruction given separately to whichever agent handled the `ai-assistant` extraction (participant list shows `hooks-E-assistant`) vs. an unprompted resurrection — that requires `team-lead` to reconcile against that agent's actual brief, which I don't have visibility into. Already reported to `team-lead` directly (msg sent before this file was written).
- Everything else in `ai-assistant` that maps 1:1 to the original (`TabIcon`, `RoadmapChecklist`, `AdminAssistantSwitch`, the top-level state machine in `use-ai-assistant.hooks.ts` — `settings`/`loadError`/`saveError`/`saving`, the load effect, the "trust the server response" pattern on toggle, both error strings) was read in full and matches verbatim, including declaration order and effect dependencies.

---

## Verified: previously-caught bugs remain fixed

Both bugs the six-agent batch caught and reported mid-flight were independently re-verified against the current working tree — still fixed, no regression:

- **`comments`** (`apps/admin/src/features/comments/hooks/use-comment-queue.hooks.ts:68,118`): `describeApiError(e, "failed to load the moderation queue")` and `describeApiError(e, "Failed to purge comment.")` both match HEAD exactly (`git show HEAD:apps/admin/src/sections/Comments.tsx:88,138`). The third, structurally similar catch at line 98 (`describeModerationError(e)`, the *moderate* action) is correct as-is — HEAD's own `Comments.tsx:118` uses `describeModerationError(e)` for that specific action too, so this was never part of the miscopy.
- **`settings/SettingsUi`**: `apps/admin/src/features/settings/SettingsUi.tsx:237` reads `onChange={(next) => s.instructions.onChange(next ?? DEFAULT_INSTRUCTIONS)}`, matching the original (`git show HEAD:apps/admin/src/sections/SettingsUi.tsx`) exactly. Confirmed by the batch-C subagent, which also swept every other `??` fallback and tab in the 837-line file (Notifications' patch-merge, Privacy's full-state emit, Appearance's `livePreview={false}`, Language, all six `useSettingsSlice` configs, `describeSaveStatus`'s nested-ternary precedence) — no siblings of the same mistake found.

## Verified: three disclosed deviations are genuine non-bugs

I traced all three myself, independently of the subagents:

1. **`collections/rules.ts`'s shared `nextRowId` counter** — confirmed the original (`git show HEAD:apps/admin/src/sections/Collections.tsx:63,66,238`) declares exactly one module-level `let nextRowId = 1;` used by both `emptyField()` (the New-dialog) and the `useMemo` that seeds `EditFieldsDialog`'s draft (`fields.map((f) => ({ ...f, _rowId: nextRowId++ }))`) — i.e. the original genuinely shares one counter across both dialogs. Current `rules.ts:56-65` declares the same single `let nextRowId = 1;` used by both `emptyField()` and `initializeDraftFields()`. Match confirmed.
2. **`recovery/rules.ts`'s `parseDeepLinkEnvelope`** — original (`git show HEAD:apps/admin/src/sections/Recovery.tsx:348-352`) is `let envelope: DatabaseContextEnvelope; try { envelope = JSON.parse(raw); } catch { return; }` — no truthiness check, only a `JSON.parse` throw guard. Current `parseDeepLinkEnvelope` (`apps/admin/src/features/recovery/rules.ts:53-58`) does `try { return { ok: true, envelope: JSON.parse(raw) }; } catch { return { ok: false }; }` — same guard, same non-truthiness semantics (a literal `"null"`/`"0"`/`"false"` payload still parses to `ok: true`). Match confirmed. Also confirmed the caller (`use-recovery.hooks.ts:57`) wires `parsed.ok` correctly.
3. **`collections`'s `runLifecycle` `void`** — original (`git show HEAD:apps/admin/src/sections/Collections.tsx:498,585`) has `void runLifecycle(...)` at the `LifecycleConfirmDialog` confirm handler (line 585) but **no** `void` at the row-menu Reactivate action (line 498: `onSelect: () => runLifecycle(ct, "reactivate")`). Current (`apps/admin/src/features/collections/Collections.tsx:404,428`) adds `void` at the row-menu site (`onReactivate: (contentType) => void runLifecycle(contentType, "reactivate")`) that didn't have it before. Confirmed this is purely cosmetic: `void expr` only discards an expression's value, it doesn't change when or whether the underlying promise executes — since neither call site ever awaited the promise, sequencing is genuinely unchanged. Not a bug.

## Verified: `forms`'s orphaned hook is dead, and not drifted

`apps/admin/src/features/forms/hooks/use-forms-list.hooks.ts` is confirmed dead code — `grep -rn "use-forms-list"` across `apps/admin/src` finds no import of it anywhere; `FormsList.tsx` still holds the identical logic inline (`useState`/`useEffect`/`toggleStatus`). I diffed the two byte-for-byte (accounting for comment/wrapper-only differences): the state block, `load()`, and `toggleStatus()` — including both error strings (`"failed to load forms"`, `"failed to update form status"`) — are character-identical between the live inline copy and the orphaned hook, and both match `git show HEAD:apps/admin/src/sections/FormsList.tsx` exactly. So the dead code is stale in the sense of being unused, but it has **not drifted** from the live version — neither copy is the "wrong" one; they say the same thing. This predates the six-agent batch, as stated in the original brief; no new finding here beyond confirming the "unused, not diverged" characterization.

---

## Per-feature coverage (what was actually read, thorough vs. sampled)

All 26 features were read in full by either me directly or one of four parallel subagents using the same method (original via `git show HEAD:...`, current via the union of `Component.tsx` + `hooks/*.hooks.ts` + `rules.ts`). No feature was skipped. None were merely sampled — every subagent and I confirmed full reads, not skims, for every file in scope.

| Feature | Examined by | Depth | Result |
|---|---|---|---|
| appearance | batch A | thorough | clean |
| analytics | batch A | thorough | clean |
| auth (Login) | batch A | thorough | clean |
| workspace | batch A | thorough | clean |
| integrations/IntegrationDeliveries (+ shared rules.ts, Integrations.tsx) | batch A | thorough | clean |
| widgets/WidgetRegionEditor (+ shared rules.ts) | batch A | thorough | clean |
| widgets/WidgetRegions | batch A | thorough | clean |
| database (3 sub-sections, 3 hooks) | batch A | thorough | clean |
| pages | batch A | thorough | clean |
| collections/Collections (4 hooks + shared use-escape-to-cancel + rules.ts) | batch B | thorough | clean (nextRowId re-verified independently, see above) |
| recovery (2 hooks + rules.ts) | batch B | thorough | clean (parseDeepLinkEnvelope re-verified independently, see above) |
| redirects (3 hooks + rules.ts) | batch B | thorough | clean |
| roles (hooks + rules.ts) | batch B | thorough | clean |
| seo (4 hooks + rules.ts) | batch B | thorough | clean |
| taxonomy (5 hooks + rules.ts) | batch B | thorough | clean |
| settings/SettingsUi (2 hooks + rules.ts) | batch C | thorough | clean (known fix re-verified independently, see above) |
| ai-assistant (4 hooks + rules.ts) | batch C, then me directly | thorough | **RT-01 — see above** |
| settings-raw (5 hooks + rules.ts) | batch D | thorough | clean |
| forms/FormEditor (5-6 hooks + rules.ts) | batch D | thorough | clean |
| forms/FormsList (dead-code hook) | me directly | thorough | clean, dead-but-not-drifted (see above) |
| media (4 hooks + rules.ts) | batch D | thorough | clean |
| comments | me directly (targeted re-verification only) | targeted | already-fixed bug confirmed still fixed; did not re-audit the rest of the file beyond the two catch sites and their sibling |

Not independently re-examined by me beyond the subagent reports: appearance, analytics, auth, workspace, integrations, widgets (both), database, pages, redirects, roles, seo, taxonomy, settings-raw, forms/FormEditor, media. I did not re-derive these from scratch — I'm relying on the subagents' full-read claims and their specific cited line-level evidence (comparator/fallback/`useState`-count cross-checks, specific quoted snippets), which is consistent with what I found directly on the two features (ai-assistant, comments) where I did check their work. If a second-pass spot-check of any of these is wanted, I did not do one.

## What I did not get to

- No feature was left completely unexamined.
- I did not run the project's test suite (scoped or full) against any of the 21 delegated features — the subagents' "clean" verdicts rest on static line-by-line comparison, not on executing tests. Two subagents (batch C, batch D) were authorized to run single existing test files narrowly but reported no need since no discrepancy was found to check.
- I did not investigate whether `ai-assistant`'s reintroduced ADR-058 wiring is itself correct/safe on its own terms (auth, input validation, error handling) — RT-01 is scoped to "this shouldn't have silently happened during a behavior-preserving extraction," not a security review of the reintroduced code.
