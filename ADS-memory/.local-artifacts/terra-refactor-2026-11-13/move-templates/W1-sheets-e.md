# W1 sheets, Group E (continuation of group B: #20, #22, #23) — PARTIAL
Run 2026-11-16, unattended, from Tovu `b28d38c6` / Jini `b7666092` (both `refactor/terra`). Docs only; no source edits. Skeletons: `scripts/make-sheet.py <feature> --kind all --tovu <Tovu> --jini <Jini>`. Untangle overlap: every row of `../untangle/sheets/*.repoint.tsv` naming a file of the feature (re-checked here; group B had listed email-templates as "none", which was wrong: `C3:461`).

| # | feature | sheet | slices | tier (sheet / exec) | untangle overlap | status | est. executor tokens |
|---|---|---|---|---|---|---|---|
| 20 | website/features/email-templates | `split-email-templates.md` | SP-email-templates-1 (`operations.ts` -> NEW `@jini-ai/platform/mail/email-template-operations`, 5-method `EmailTemplateStore` port; Tovu keeps `emailTemplateStore({ deps })`) | Opus / Sonnet | yes: `C3:461` (tool-registrations.ts line 6, not edited) | READY, after wave B | ~90k |
| 22 | website/features/plugin-runtime | `move-plugin-runtime.md` | MV-plugin-runtime-1 READY; plugin-export, invocation-core-deps, install -> STAY; tiptap-blocks -> STAY; DD x2, SP x1, MV-2 (sdk-resolver) NOT FILLED | Opus / Sonnet | yes on other files (`C3:406,482,483`, `C8:141`, `C11:157-161`); none on MV-1 | PARTIAL: MV-plugin-runtime-1 READY now | ~70k (MV-1) |
| 23 | website/features/web | `split-web.md` | DL-web-1 (group B), DD-web-1, SP-web-1 READY; SP-web-2 BLOCKED | Opus / Sonnet | yes: `C3:464`, `C11:202` (tool-registrations.ts), `C5:316` (web-page.unit.test.ts) | DL-web-1 now; DD-web-1 then SP-web-1 after wave B | 25k + 30k |

## Executable now (no overlap, no decision)
MV-plugin-runtime-1, DL-web-1 (group B).
## Executable after wave B merge (text-guarded, in this order)
DD-web-1 -> SP-web-1 (SP-web-1 guards DD-web-1's resulting blob `022cdf85`); SP-email-templates-1.

## Re-kinds
- plugin-runtime `plugin-export.ts` MOVE -> STAY: Jini already has the port (`PluginSdkBinding.readDefinedPlugin`, plugins/src/host/ports.ts:38); Tovu's body is the `@tovu/sdk` ABI binding.
- plugin-runtime `invocation-core-deps.ts` DELETE -> STAY (SDK hook-name binding); `declarative-content-types.ts` DELETE -> DEDUPE/binding (injects `SYSTEM_CONTENT_TYPES`; drop its re-exports).
- plugin-runtime `install.ts` MIXED -> STAY (TOVU_* env adapter over Jini's policy).
- plugin-runtime `tiptap-blocks.ts` MOVE -> STAY (editor adapter; its own header keeps it with the plugin) — removes the TipTap owner-decision dependency from this feature.
- plugin-runtime `agent-tools.ts` MIXED -> DEDUPE type-narrowing (3 duplicated core types) + catalog STAY.
- web `web-page.ts` DELETE -> DEDUPE/binding (keeps the product user agent and the `HttpClientPort` adapter; only the re-exports go).
- web `agent-tools.ts` -> SPLIT confirmed with a byte-identical catalog (host passes permission, url description, destination note).

## Blocked / not filled
- SP-web-2 (web `tool-registrations.ts` handler): BLOCKED on site-inspection `page-body.ts` reaching Jini (cycle SCC, W3) and on `requireToolPermission` being `@jini-ai/cms/core` (COMMON 5). Not an owner question.
- plugin-runtime NOT FILLED (context budget): DD-plugin-runtime-1 (declarative-content-types, Sonnet ~40k), DD-plugin-runtime-2 (agent-tools types, Sonnet ~40k), SP-plugin-runtime-1 (install-source, Sonnet+review ~60k), MV-plugin-runtime-2 (sdk-resolver + boot shell repoint, Opus ~80k; security-labelled CIC U-002, spawn-based tests).

## Owner/coordinator questions
None new. (Group E made every call in-sheet; behaviour-neutral internal differences in SP-email-templates-1 are listed in its "Design decisions" item 3 for the reviewer.)

## Lessons (for the next group)
- Check the untangle TSVs per FILE, not per feature row in the old index: group B's "none" for email-templates missed `C3:461`.
- When two slices of one feature edit the same file in sequence (DD-web-1 then SP-web-1), compute the intermediate blob in the sheet so the second slice is still blob-guarded.
- Prefer keeping a Tovu binding with the old exported signature (kernel, content-analyzer) when a required port would otherwise touch dozens of test call sites; use a counted perl rewrite (email-templates) only when the call shape itself must change.
