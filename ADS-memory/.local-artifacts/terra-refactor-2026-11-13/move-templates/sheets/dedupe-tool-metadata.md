id: DD-tool-metadata-1   (template T-DEDUPE, `type-narrowing` variant; written 2026-11-15 from Tovu 54dac1ff3 / Jini af2389793, refactor/terra; replaces harden-tool-metadata.skip.md)
feature: website/contracts/core/tool-metadata
decision: DEDUPE, type-narrowing. Classifier said HARDEN (DEDUPE-AFTER-HARDENING, sim 0.8); the parity list is empty, so per T-HARDEN step 0 it is re-kinded. Tovu's ToolApprovalPolicy becomes `extends ToolApprovalMetadata` narrowing only `rule`; ToolApprovalClass becomes an indexed access. No importer change, no Jini commit.
tovu_files:
  - apps/website/src/contracts/core/tool-metadata/approval-policy.ts | blob ab110905d4399077f621602a62927ef17286ce90 | type-narrowing
jini_survivor: @jini-ai/core (barrel) ToolApprovalMetadata at packages/core/src/tool-metadata-types.ts:2 | blob f0dee41efea721fc19686c97f0fffac2ba2065d7
  barrel chain: packages/core/src/index.ts:2 `export * from './tool-metadata.js';` -> packages/core/src/tool-metadata.ts:2 `export type { ToolApprovalMetadata, ToolMetadata, ToolMetadataById } from './tool-metadata-types.js';`. No subpath exports it (core package.json has no "./tool-metadata" entry). Tovu imports the barrel (allowed: COMMON rule 5 binds Jini-side imports only); Tovu already imports `@jini-ai/core` in this folder's siblings (contracts/core/native-approval-memory.ts:1).
behaviour_diff:                            # read from both bodies
  - type `class`: Tovu 'read'|'edit'|'trash'|'delete'|'restore-over-existing'|'publish'|'replace-secret'|'escalation' / Jini the same 8 literals in the same order / same
  - type `confirmation`: Tovu 'direct'|'policy'|'plan' / Jini same / same
  - type `input`: Tovu optional 'human-form' / Jini same / same
  - type `rule`: Tovu optional 'http-method'|'page-control'|'export-commit'|'plugin-enable'|'execution-setting'|'theme-activation' / Jini optional string ("Host-owned input classification rule") / narrowed (Tovu product policy, stays in Tovu)
  - readonly modifiers: all four readonly on both sides / same
  - runtime: none (type-only file; no emitted code) / same
real_caller_check: apps/website/src/contracts/headless/assistant-tool-approval-policy.ts:41 `} as const satisfies Readonly<Record<string, ToolApprovalPolicy>>;` relies on `rule` staying a closed union (a misspelled rule must still fail to compile); the `extends` override keeps it closed. Line 12 re-exports `ToolApprovalClass, ToolApprovalPolicy` by name: both names stay exported.
binding: |
  The WHOLE new approval-policy.ts (exact text, 11 lines, ending with one newline):
  ----8<----
import type { ToolApprovalMetadata } from '@jini-ai/core';

/** Owner policy: classify the action rather than the input's write-shaped fields.
 * ONE reviewed declaration per owning domain. Reversible actions run directly: read, edit (which
 * includes publishing or unpublishing on this site) and trash (restorable from the Trash).
 * Only what cannot be undone from here asks — see {@link approvalClassAsks}.
 * `publish` means the action leaves this site: the live site, a deploy, a git host, an email.
 * Plan entries describe domain facts through Jini; human forms stay on their secret-card engine.
 * New native registrations fail closed until their owner declares an action policy. */
export type ToolApprovalClass = ToolApprovalMetadata['class'];
export interface ToolApprovalPolicy extends ToolApprovalMetadata { readonly rule?: 'http-method' | 'page-control' | 'export-commit' | 'plugin-enable' | 'execution-setting' | 'theme-activation' }
  ----8<----
  (the text between the two ----8<---- lines, with NO leading indentation; that is 11 lines: import, blank, 7 comment lines, 2 declarations)
  The owner-policy doc comment (current lines 1-7) is kept verbatim: it is Tovu product policy and stays above the binding.
why_moves:
  - "Owner policy: classify the action rather than..." -> stays in Tovu above the binding (verbatim)
jini_test_text: -
failing_test: -   (no behaviour_diff row says "differs"; the only change is a type expressed through Jini's)
importer_edits: -   (type-narrowing: every importer keeps its specifier)
census: python3 scripts/census.py /Users/la/Programming/tovu-codex-trial-terra apps/website/src/contracts/core/tool-metadata/approval-policy.ts | allowed: the 63 type-only importers at HEAD (58 sibling `tool-metadata/*.ts` files with `import type { ToolApprovalPolicy } from './approval-policy.js';`, tool-metadata/index.ts:4, contracts/headless/assistant-tool-approval-policy.ts:2 and :12). Any importer that is NOT type-only (a value import) = SKIP. The census is a guard only; no importer is edited.
bundle_check: -   (type-only; nothing emitted)
jini_msg: - | tovu_msg: "refactor(tool-metadata): express ToolApprovalPolicy through @jini-ai/core ToolApprovalMetadata" | body "ToolApprovalPolicy extends the Jini declaration and narrows only rule; ToolApprovalClass is ToolApprovalMetadata['class']. Types only."

Steps for this sheet (T-DEDUPE type-narrowing): blob checks (Tovu approval-policy.ts, Jini tool-metadata-types.ts); `rg -n "export interface ToolApprovalMetadata\b" /Users/la/Programming/jini-terra-base/packages/core/src/tool-metadata-types.ts` prints exactly one line; `rg -n "ToolApprovalMetadata" /Users/la/Programming/jini-terra-base/packages/core/src/tool-metadata.ts` shows the export-type line; re-read both declarations and confirm each behaviour_diff row; census (type-only); overwrite approval-policy.ts with the binding text; eslint it; one Tovu commit with only apps/website/src/contracts/core/tool-metadata/approval-policy.ts.
Cloud run owes: Tovu typecheck only. No RED test.
Open questions for the owner: none.
