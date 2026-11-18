# audit2 A01, A11, A14 — verdicts (sheet-fixes-2, 2026-11-18; plan edit only)
These three rows (`origin/plan/audit2-2026-11-15:audit2/AUDIT-ADDITIONS-2-a.tsv`) never had a sheet; run `wave3/audit2-a` stopped on each (`origin/wave3/audit2-a:cloud-results/audit2-a.md`). Re-derived on refactor/terra (Tovu ada11733f / Jini 4c1892368). None is dispatchable today; each line says what would make it so.

## A01 Tovu wrappers -> existing Jini exports — VOID (done part) + BLOCKED (rest, per item)
| Item | Verdict | Reason / what unblocks it |
|---|---|---|
| `use-focus-trap.hooks.ts`, `database-transfer/sqlite-source.ts`, `agent-plugins/service-ports.ts` type re-exports, `use-site-confirm.hooks.ts` (over `useConfirmRequest`) | VOID | landed in Tovu `7756ba36` |
| icon + byte-label copies | VOID | landed in `68d52de7`, `c15b046d` (byte labels: see A10) |
| `lib/translation-entry.ts` | VOID | it exists to keep a lint rule (`sonarjs/no-hardcoded-passwords`) quiet at one site; inlining re-triggers the rule. Not a forwarder |
| `lib/viewer-time-zone.ts` | VOID | 4 lines; the row itself keeps its `'UTC'` fallback, which the Jini helper does not have |
| `WidgetPickerDialog/widget-picker-port.hooks.ts` | VOID | its doc comment records why it must not reuse `AdminWidgetsPort` (components may not import features); the Tovu `AdminWidget` types also differ |
| `ConfirmActionDialog.tsx` | BLOCKED (prerequisite) | not drop-in (`dialogRef/titleId/extra/handles` vs `open/title/body/confirmLabel`); waits on C2 pass B0 (row) |
| `deployment/StaticSiteTab.hooks.ts` `useCopyLine` -> `@jini-ai/ui` `useCopyToClipboard` | BLOCKED (owner, behaviour) | Tovu's copy swallows clipboard errors (an owner-rule violation in itself) and uses `navigator.clipboard` only; Jini's takes a `ViewerClipboardPort`, falls back to `execCommand`, returns a boolean. Owner question A01-Q1: adopt Jini's semantics (visible: a failed copy can now be reported) — recommended yes, with a failing test first |
| desktop `renderer/app/Spinner.tsx` -> `@jini-ai/ui` `Spinner({ size, label })` | BLOCKED (owner, markup + dependency) | different markup/class (`span.spinner[aria-hidden]` vs a sized, labelled element: an a11y-visible change) and the desktop renderer's use needs the `@jini-ai/ui` declaration checked in `apps/desktop/package.json` (same rule as A60). Needs an E-level look |
| `media/hooks/use-edit-media-modal.hooks.ts` -> `useNativeDialog`; `UserInterfaceSettingsPanel.tsx` -> ui-kit `Switch`; desktop `use-import-website` / `use-workspace-chat-pane` copy + folder-drop slices | BLOCKED (visual parity) | markup/behaviour parity needs a Chrome/Electron look (proof E) that the row does not give; a sheet per item after the owner picks which to pursue |

## A11 desktop site preview -> `desktop-host/preview` — BLOCKED
1. **Plan collision (lesson 42):** the desktop-extraction plan (`origin/plan/desktop-extraction-2026-11-16`) already classifies these files: `site-preview-store.ts` (214) STAYS as a Tovu format (`D3-supervision.md:22`), `site-theme-preview-ipc.ts` (72) belongs to IPC run D1b1 (`D1-ipc-lifecycle.md:110`), theme preview STAYS (`D3:23`). Two plans may not own the same files: the coordinator retires A11 or rewrites it inside D1/D3.
2. **Design first (row: "needs Opus"):** reference-counted preview stream ownership with sender claims/teardown, a generation-safe live-guest registry and an atomic hashed PNG cache are lifecycle code (lessons 14, 21); the split needs an Opus design with characterization tests that fail on dropped teardown.
3. **Proof P** (packaged desktop) needs an Electron-capable machine and a published Jini snapshot (DX-OD10); cloud runs here have no `electron` installed.
Files on refactor/terra: `contracts/site-theme-preview-bridge.ts` 24, `main/boot/site-preview-guests.ts` 97, `site-theme-preview-ipc.ts` 72, `site-theme-preview.ts` 123, `site-preview-store.ts` 214 (+ 2 renderer hooks).

## A14 desktop packaging checks -> `devops/packaging/electron` — BLOCKED
1. **Scope change:** `scripts/stage-website-shared.ts` leaves A14: the desktop-extraction plan deletes it (`D0-website-imports.md` section D0c3).
2. **Proof:** the row's acceptance is "same inputs give the same gate output before/after" for release gates (`check-tree-quiet.ts` 174, `smoke-native.ts` 227, `packaged-gate-isolation.ts` 61, `staged-closure-scan.ts` 28). That needs a packaged build and the release workflow's `build` job (macOS + Windows), not available to a cloud run without Electron. A sheet is worth writing only together with a CI job that records the gate outputs on the base (the "before" half of the proof).
3. When unblocked: Sonnet sheet + Opus review (row), extending Jini `devops/packaging/electron/policies.ts` `treeQuietProblems` (snapshot compare + timed sampling over injected fs/delay/watcher); STAYS: verified paths, watcher pattern, native-module selection, entry scripts.
