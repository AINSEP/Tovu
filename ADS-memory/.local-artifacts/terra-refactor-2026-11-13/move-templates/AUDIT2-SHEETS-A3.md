# Audit2 executable sheets, batch A3 (rows A39..A67), 2026-11-16, planning only, nothing executed

Source rows: `plan/audit2-2026-11-15` `audit2/AUDIT-ADDITIONS-2-a.{tsv,md}`. Written against **Tovu `integ/wave-b`** (`../code`) and **Jini `integ/wave-b`**, every cited line read on 2026-11-16. Same format as batch A (`AUDIT2-SHEETS-A.md`, A02-A08): fenced guard block with blob hashes, importer census command, contracts/ports, tests red-first, Jini-first commits, `untangle overlap`, `STOP`. Another run covers A09-A38. Sheets live in `sheets/audit2/`; templates `T-*.md` + `COMMON.md` append at assembly (`cat T-<KIND>.md <sheet> COMMON.md`). Sheet files are force-added (`ADS-memory/*` is gitignored).

| id | kind | sheet | slices | tier | blockers | status | est. executor tokens (Sonnet) |
|---|---|---|---|---|---|---|---:|
| A49 | UI (+SPLIT) | `ui-a49-admin-content-analysis.md` | 3 (Jini pure rules, Jini controller+React, Tovu bind+delete) | Sonnet; Opus review of kit use | after wave B merge (`PostEditor.tsx` applier files); row 91 (`rules.ts`) is superseded by this sheet | READY | 36k |
| A50 | SPLIT (security) | `split-a50-web-security-predicates.md` | 2 (Jini core/contracts/server, Tovu repoint 9 importers) | Sonnet + Opus security review | C4 has LANDED (`contracts/server/origin.ts` exists); execute after wave B merge (re-take 9 blobs) | READY | 34k |
| A51 | SPLIT (auth path) | `split-a51-session-bootstrap.md` | 3 (Jini user-management/session-bootstrap, Tovu admin, Tovu desktop) | Sonnet + Opus review of every slice | "audit B04" is the theme engine (mislabel), independent; R11 touches `main/index.ts` (not edited) | READY | 36k |
| A52 | SPLIT | `split-a52-native-permission-policy.md` | 2 (Jini agent-runtime native-permissions, Tovu bind) | Sonnet + Opus review (grant validator) | C6 NOT needed (generic over keys); executable now | READY | 34k |
| A57 | UI | `ui-a57-admin-shell-helpers.md` | 2 (Jini browser+react hooks, Tovu swap) | Sonnet + Opus review (hook contracts) | C9a landed, no slot needed; after wave B merge (`App.tsx`, `main.tsx`) | READY | 36k |
| A58 | SPLIT | `split-a58-desktop-version-update-bridge.md` | 2 (Jini desktop-host/app-version, Tovu bind) | Sonnet + review | none (hooks stay Tovu bindings: `desktop-host` has no react) | READY | 35k |
| A59 | SPLIT | `split-a59-desktop-mcp-stdio-smoke.md` | 2 (Jini mcp/testing, Tovu bind) | Sonnet + review | none (only the handshake half of the file moves) | READY | 36k |
| A60 | SPLIT (credentials) | `split-a60-plugin-token-validation.md` | 3 (Jini agent-plugins/connect, desktop, website duplicate) | Sonnet + Opus glance | "audit B06" is an unrelated ZIP job, not a blocker | READY | 33k |
| A61 | UI | `ui-a61-owner-recovery-forms.md` | 3 (Jini hooks, Tovu hook binding, Jini views) | Sonnet + Opus review (secret handling) | views (S2) BLOCKED on C9c (`user-management/react/kit.tsx` absent); hooks S1+S3 ready | PARTIAL (S2 blocked) | 33k (S2 deferred) |
| A65 | SPLIT | `split-a65-daemon-tool-extensions.md` | 2 (Jini daemon/tool-extensions, Tovu bind) | Sonnet + Opus review | execute after R8 (daemon `index.ts`/`package.json` blobs) | READY (after R8) | 33k |
| A66 | DEDUPE | `dedupe-a66-glyph-geometry.md` | 1 (Tovu only) | Sonnet | none; **scope corrected**: 0 byte-identical glyphs vs the Jini catalog | READY (scope shrunk) | 14k |
| A67 | DEDUPE (+hardening) | `dedupe-a67-cli-prompt-input.md` | 2 (Jini cli readers, Tovu bind) | Sonnet + review (bounded stdin = behaviour change) | after wave B merge and R13 (`cli` index/prompt blobs) | READY (after R13) | 31k |

Totals written: 12 sheets, 27 slices, about 391k executor tokens.

## Skipped: hard-blocked rows (not written, per the run rules)
A40 (editor-surface TipTap move, precondition owner 11-15), A43 (CLASSIFY-126), A44 (CLASSIFY-139/131), A54 (CLASSIFY-160), A56 (CLASSIFY-147).

## NOT STARTED (out of context budget; unblocked or partial, next run)
A39 (skills installed-package port; HARDEN, needs a Jini port design first), A41 (workspace chat transport), A42 (sidecar scoped registration, R11 wave D), A45 (consent views + tools), A46 (analytics recent hits), A47 (html-editor preview ports), A48 (recovery screen on `AdminRecoveryPort`), A53 (themes registry + appearance preview), A55 (image selection field), A62 (themes explorer helpers), A63 (asset transfer write prep, CLASSIFY-112 partial), A64 (sites secret reveal/download helpers). Notes for the next author: `packages/admin/src/react/kit.tsx` (C9a) exists with slots Button, IconButton, TextField, TextArea, Select, Switch, Dialog, ConfirmDialog, Tabs, Menu, Notice, Spinner, Badge, InfoTip, Lightbox, WidgetSelect, TabBar, HtmlEditor, ErrorNotice and hooks useFetchQuery/useFetchMutation/useDirtyGuard/useConfirmController; `user-management/react/kit.tsx` and `chat/react/kit.tsx` do not exist yet (C9c/C9b).

## Findings that changed row judgments (for the coordinator)
1. **A66's premise is false.** A script compared all ~73 `d=` path strings in the 11 files with `ICON_RENDERERS`: zero identical. The sheet shrinks to Tovu-internal repeated-path dedupe (6 strings) and lists near-misses as owner-look decisions.
2. **A58/A59 move less than the row says.** `desktop-host` has no `react`, so the hooks stay as Tovu `useSyncExternalStore` bindings over Jini controllers; for A59 only the stdio handshake (about 45% of `smoke-bridge.ts`) is generic.
3. **A60 found a third copy of one rule** (`apps/website/.../new-site-agent-plugin-tokens.ts:23-52` duplicates the desktop token-map validation); the sheet repoints both. Jini's own plugin-id pattern differs (dots allowed), so the pattern is a required limit.
4. **Mislabelled preconditions:** A51 "audit:B04" (theme engine) and A60 "audit:B06" (ZIP special-entry refusal) are unrelated to those rows.
5. **A50: C4 has landed**, so the "wave B" blocker is gone; scheme-matching gap between `site-share-password.ts` (checks scheme) and `admin-surfaces.ts` (does not) recorded as an owner question, not changed.
6. **A52: the row's function names do not exist** (`parseNativePermissions`/`resolveNativePermissions`); real units are the snapshot validators and the per-agent projection, made generic over the capability key list so C6 is not needed.
7. **A61: user-management has no kit yet** (C9c), so only the hooks move now.
8. **A65/A51/A57:** the real generic unit is far smaller than the file (A65: the guarded-registry view + ordering, about 50 of 154 lines).

## Unverified facts the executor must check at step 0 (each sheet names the command)
- A49: the server `content-analyzer/index.ts` report fields vs the Jini parser; class-rename counts.
- A50: exact importer counts (12 references in 9 files).
- A51: the `message` map reproduces the three `desktop sign-in refused:` strings byte-for-byte.
- A57: App.tsx call-site arguments for the two hooks; Tovu test file list.
- A59: `diagnosticToolIds` exists in `sanitizeUntrustedText`.
- A67: whether `mapErrorToCliOutcome` already maps `PayloadTooLargeError`.
