# Source Control UI — tabbed page-shell rebuild (2026-08-16)

Dispatched as a web-design task: "the Source Control page UI is terrible, fix it." Loaded
`AI-Dev-Shop/agents/web-design/skills.md` (v2.0.0, fix-by-default persona) plus all eight base
skills it requires eagerly, plus the `ui-ux-design` premium bundle (`premium-ui.md` + its three
design-school notes), before touching any code.

## What was wrong

`SourceControl.tsx` rendered as one big `.card` holding all three provider rows, with no
`page-header` and no way to tell it apart from a settings-dialog panel dropped onto a route. Its
nearest sibling, `deployment/Deployment.tsx`, has a real `page` + `page-header` (kicker/title/
description) + `TabBar` shell; Source Control had none of that.

Before screenshot: `development/e2e/.artifacts/source-control-before.png`

## Two things flagged before building (checked in with the dispatching agent first) — both confirmed

1. **`SourceControl.tsx`'s own file header, written the day before, explicitly argued AGAINST a tab
   bar** ("three flat rows was the explicit brief... this page has no tab bar to begin with").
   Confirmed by the team lead: this was the owner's own 2026-08-15 decision, reversed by the owner
   directly after seeing this page next to `deployment/Deployment.tsx`. The header now says so
   explicitly — a same-week reversal, on the record, not drift or an agent's own call.
2. **The brief said a GitHub token was already saved; the live dev instance showed it NOT
   connected** (open, empty form). Confirmed by the team lead against the database directly:
   `source_control_credential_sets` was genuinely empty; the token the owner had in mind was saved
   through Deployment → Static Site, into the entirely separate `publish_credential_sets` table
   (`github-pages`, saved the same day). The page's "not connected" render was correct — two
   different stores, not a bug.

   First pass at proving the connected-row rendering worked against real data used the wrong method:
   I saved a placeholder token (`github_pat_dev_probe_do_not_use_...`) through the page's own Save
   button. The team lead corrected this — a token landing in the dev DB's real sealed credential
   store is a real credential, not mine to place there for a screenshot. I deleted it immediately via
   the feature's own `DELETE .../source-control/credentials/:id` endpoint (verified empty afterward)
   and instead produced the connected-state screenshot from a fixture-injected render — the same
   `useSourceControlCredentialsHook` DI seam the unit tests already use, with `react-testing-library`
   dumping the resulting markup + the app's own CSS to a static file, screenshotted from `file://`.
   No database write involved. See `source-control-connected-fixture.png` below.

## What changed

- **`SourceControl.tsx`** rebuilt as a thin shell mirroring `Deployment.tsx` exactly: `page` +
  `page-header` (kicker "Operations", title "Source Control", the same scope-boundary sentence that
  used to live in the card as the page description) + `TabBar` with one tab, `"providers"`. Carries
  the same `resolveActiveTabId` guard against a junk `?tab=` value and the same
  `navigate(..., { replace: true })` on tab switch as `Deployment.tsx`.
- **New `ProvidersTab.tsx`** holds everything the old `SourceControl.tsx` used to render directly:
  the three provider rows (GitHub, GitLab, Bitbucket), unchanged — `SourceControlCredentialsList`,
  `SourceControlProviderRow`, `SourceControlCredentialFields`, `SourceControlRowTodo`,
  `SourceControlRowDone` moved verbatim. No validation, save/fetch, or wire-type logic touched.
- **`apps/admin/src/styles/source-control.css`**: renamed `.source-control-page` →
  `.source-control-tab` (the per-tab wrapper, matching `.deployment-tab`'s exact role and rule);
  updated the file's header doc to explain the shell move.
- **`apps/admin/src/panels.tsx`**: `source-control` route now passes `tabId={ctx.query.get("tab")}`,
  same as `deployment`'s route just above it.
- **`source-control-i18n.ts`**: added a new `Providers` key across all 21 locale dictionaries (es, id,
  de, zh-CN, zh-TW, pt-BR, ru, fa, ar, ja, ko, pl, hu, fr, uk, tr, th, it, hi, ur, bn) — the tab label
  and the one card's title. No other new user-facing strings were needed: the existing scope sentence
  moved from the card's lead paragraph into the page description verbatim, so no new translation
  surface there.

### Tab structure — one real tab, no filler

Per the brief's own steer ("a single well-built tab beats four with one real one in it"), built
**one** tab: "Providers." Considered and rejected a disabled "Repositories (soon)" second tab (
`TabBar.tsx` has a documented `disabled` prop built exactly for this kind of scaffolding) — decided
against it as filler with nothing behind it; flagged the option in the check-in message rather than
building it unasked. Commit history, sync, diffing, and branch management remain explicitly
out-of-scope per `ProvidersTab.tsx`'s own header, same as before this pass.

### Requirement #2 (saved-credential visibility) — already built, verified against real data

The row-level "connected" treatment (`SourceControlRowDone`) already matched the brief's
requirements before this pass: a settled summary line — green checkmark, "GitHub connected · token
stored, encrypted · saved <date>" — visible with no click required, plus a "Replace token ⌄"
disclosure to save a different token. This pass didn't need to touch that logic, only give it a page
shell. Verified rendering correctly with the exact production markup and CSS, via a fixture-injected
render (see the correction above) rather than a real database write.

## Follow-up dispatched separately: reuse the Deployment publish credential

Owner decision, not built in this pass (server-side work outside this feature's fence — a read
across two credential stores plus a decrypt-and-reseal from one sealed store into the other): when a
not-yet-connected provider row already has a matching Deployment publish credential saved (e.g. a
`github-pages` row already exists in `publish_credential_sets`), the row should offer a one-click
"reuse that credential" path instead of asking for the same token twice.

Left a seam, not a stub — `SourceControlRowTodo`'s own doc comment in `ProvidersTab.tsx` records:
- **Where** the affordance goes once built: directly below the row's subtitle, above
  `SourceControlCredentialFields` — settled fact first, fields second, same order the connected
  state already uses.
- **What data the UI needs, per provider**: whether a matching publish credential exists, and when
  it was saved (same shape as this store's own `updatedAt`). Neither field exists on
  `SourceControlCredentialsController`/`useSourceControlCredentialsHook` today — adding them is that
  follow-up's job.
- No placeholder button was added — an inert control pointing at nothing not yet built would read as
  a defect, not a preview.

## Screenshots

- Before: `development/e2e/.artifacts/source-control-before.png`
- After (no saved credentials): `development/e2e/.artifacts/source-control-after.png`
- After, GitHub connected (fixture render, no real credential saved):
  `development/e2e/.artifacts/source-control-connected-fixture.png`

(All local artifacts, not committed — this directory has never held tracked files in this repo; the
committed driver that regenerates the first two is `development/e2e/inspect-source-control.mjs`.)

## Tests — red before green

Updated `__tests__/SourceControl.unit.test.tsx` first (new tab-shell assertions), confirmed 3 of 16
failed against the *old* implementation, then implemented. All 16 pass after; all 46 tests across
`src/features/source-control/` pass (the credentials-hook and rules test files were untouched and
stayed green throughout, since no validation/save/fetch logic changed).

Red-state output (3 failures against pre-change code):
```
❯ src/features/source-control/__tests__/SourceControl.unit.test.tsx:87:19
  falls back to the Providers tab for an absent or unrecognized ?tab= value
Test Files  1 failed (1)
     Tests  3 failed | 13 passed (16)
```

Green after:
```
Test Files  1 passed (1)
     Tests  16 passed (16)
```

ESLint (`apps/admin`'s hard 9/9 complexity gate, `noInlineConfig` on): clean on
`SourceControl.tsx`, `ProvidersTab.tsx`, `panels.tsx`, zero disable comments added. `tsc --noEmit`
shows 5 pre-existing `Element`/`HTMLElement` errors in the test file at shifted line numbers
(confirmed identical via `git stash` against the pre-change tree) — not introduced by this pass, not
touched.

## Not touched (fence held)

Credential validation rules, wire types in `lib/api.ts`, save/fetch behavior, anything under
`src/**` (server). The Bitbucket username-vs-email defect named in the brief was left exactly as-is —
`SourceControlCredentialFields`' Bitbucket username field is untouched, still a single stacked
`.field`, so a future swap to an email field is a straightforward one-field edit, not a layout
rework.

## Commits

See `git log` for this feature's files on branch `general-work` around 2026-08-16 — commits include
the test-file update, the shell/tab split, the CSS rename, the i18n additions, and this report.
