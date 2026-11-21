# COMMIT-PLAN

## WORKER-JINI — done

- Base: Jini `de4e555b9`, dispatched branch `codex/jx-w4`.
- Files: `packages/cms/package.json`, `packages/cms/src/__tests__/integration-package.contract.test.ts`; bookkeeping in this file and `REFRESH.md`.
- Tests: wrote one case before the manifest edit, asserting the exact types/import/default targets of all three subpaths. Each lookup is undefined on the base, so the case is expected red there. No execution: red/green belongs to combine under the machine rule. Existing tests retained; test count increases by one.
- Mutation owed to combine: remove any one of the three exports and demonstrate failure; import `renderHtmlTaxonomy`, `fieldMaxChars`, and `renderMediaRawHtml` from their named subpaths in the packed CMS candidate.
- API-baseline delta: additive `@jini-ai/cms/taxonomy/render-entry` and `@jini-ai/cms/forms/field-length-caps` (universal), and `@jini-ai/cms/widgets/html/media-html` (node), each with paired declaration and executable targets.
- Reuse: exposes the existing source leaves through the existing TypeScript build (`include: ["src"]`); no source, build-entry, dependency, or wrapper change.
- Look owed: none. Debt rows: none.
- Size note: `packages/cms/package.json` is now 778 lines; continued as instructed.
- Diff re-read: only the named manifest entries and test were added. Deletions: none. Existing pads and argument rules unchanged.

## tv-rjk T2-J — STOPPED

- Base: Jini `de4e555b9`, dispatched branch `codex/jx-w4`.
- Stop evidence: the required `readPluginIdentity` importer lookup found an unlisted non-test release-tool importer at `packages/plugin-catalog/scripts/generate.ts:6`, called at line 57. The sheet explicitly stops for an unlisted production importer. Coordinator must classify/include this importer before redispatch.
- Files: no T2-J source or test edits; bookkeeping in this file and `REFRESH.md` only.
- Tests: none added; stopped at importer preflight before any sheet edits. Existing test count unchanged. No checks executed.
- Mutation owed to combine after redispatch: remove legacy selection; select legacy before primary; replace undefined-only selection with nullish selection. Red/green execution remains owed for all three named cases.
- API-baseline delta: none implemented. The planned core and host additive fields remain outstanding.
- Look owed after implementation: paired Tovu Chrome Plugins list and same-publisher upgrade of a pre-existing site install.
- Diff re-read: no partial T2-J implementation. Deletions: none.
