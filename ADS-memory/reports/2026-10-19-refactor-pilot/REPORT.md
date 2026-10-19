# Refactor pilot — `deriveHtmlForm` (Jini cms), 2026-10-19

Uncommitted, Jini not rebuilt. Diff: `git -C /Users/la/Programming/Jini diff -- packages/cms/src/forms` (+ untracked `packages/cms/src/forms/html/__tests__/`). Side by side: `before.ts` / `after.ts` in this folder.

**What it does:** when an owner saves an HTML-mode form, it reads their markup and works out which fields the form submits (name, type, label, options, limits), and strips anything that could send the submission somewhere other than our server.

## Over-engineering found (before any edit)
| Found | Decision |
|---|---|
| `HtmlFieldDescriptor` duplicated `FieldDescriptor`'s `checkboxValue` | Removed |
| Loop over "every outer form" + dead `if (!parent)` guard (only one form allowed; parsed elements always have a parent) | One form; guard removed with a comment why |
| Same "remove these attributes" filter written 4× | One `removeAttributes` helper |
| Same "parent is a `<label>`?" check written 2× | One `wrappingLabel` helper |
| `htmlSubmissionDefinition` returns its input | Kept — Tovu passes it as `definitionView` (public API) |
| `index.ts` barrel, `createFormAuthoring` | Kept — package export + Tovu forms use them |
| Other parse5 users (consent, widgets, navigation) | Not merged — different jobs; this walker skips `<template>` on purpose |

## Before → after
| | Before | After |
|---|---|---|
| `deriveHtmlForm` cyclomatic / cognitive | 76 / 113 | 8 / 7 |
| `deriveHtmlForm` length | 98 lines | 23 lines |
| `prepareFormAuthoring` | 19 / 9 | 10 / 5 |
| Functions over 10 in `src/forms/html/` | 3 | 0 |
| `html-authoring.ts` coverage (lines / branches) | 94.8% / 81.1% | 100% / 100% |
| `html-authoring.ts` length | 196 lines | 267 lines (small named pieces + short docs) |

New functions (cyc/cog): `deriveHtmlForm` 8/7 (outline), `unwrapOuterForm` 4/3, `columnName` 8/7, `addGroupOption` 10/3 (lookup table `GROUP_JOINS` replaces a long and/or), `describeControl` 7/5, `controlType` 9/8, `inputFieldType` 4/1, `controlChoices` 6/3, `fieldLabel` 5/2, `constraintFields` 3/1, `removeAttributes` 1/0, `wrappingLabel` 4/2, `ifPresent` 2/1. In `authoring-adapter.ts`: `storedAuthoring` 4/1, `isPlainBuilderWrite` 4/1, `assertFormMode` 4/2. Every "why" comment moved next to its code; none deleted.

## Proof behaviour is unchanged
- Golden test written BEFORE the refactor: 17 exact JSON outputs, 8 refusals, the 200k limit — green on old and new code.
- 6 one-line REDs (guard reverted → a test fails → restored exactly).
- Folder tests 41/41; full cms suite 220 files / 2,496 tests pass; cms tsc clean; ESLint at 10 → 0 violations.
- 4 test files moved into `src/forms/html/__tests__/` (self-contained folder).
