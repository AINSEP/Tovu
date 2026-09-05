# Decisions — tovu.dev content, nav, and AI-readability

**Date:** 2026-09-04
**Branch:** `restructure/apps-website-phased`
**Status:** DECIDED — execution queued behind `docs-scaffold`

## Positioning (owner-approved working draft)

> Tovu is a self-hosted content platform you can run and operate by talking to it. Every capability
> the admin exposes — pages, themes, media, forms, members, plugins — is also a tool an AI assistant
> can call, so an agent can learn what the site can do and then actually do it.

Owner's stated intent: AI should be able to read the site easily, learn from it, explain Tovu to
people, and have an assistant learn its capabilities. This makes AI-readability the PRODUCT claim,
not merely a property of the marketing site. Every page written from here should be written against
this sentence; the owner may still revise it.

## Decision 1 — the 38 junk published pages: UNPUBLISH, keep the rows

Measured 2026-09-04: `sites/tovu-com/content.db` and the tracked `content.seed.db` both hold
**84 published rows** (41 pages + 43 posts), of which **38 are junk**: `editorext-*-verify` (11),
`blue-circle-test`, `ai-tool-test-post`, `*-coffee-roasters` demo fixtures, and `--migrated-to-page`
duplicates left behind by the rename-then-delete-then-recreate dance.

All are published, therefore in the sitemap, therefore indexable — roughly **45% of the site's
crawlable surface is test noise**, which directly fights the owner's stated goal of being freely
indexed by Google and AI crawlers.

Ruling: set to draft. Reversible, destroys nothing, removes them from the sitemap. Explicitly NOT
deletion — soft-delete reserves a slug forever (see the delete-recreate trap), and some fixtures are
still useful as manual test content.

## Decision 2 — nav: RESTRUCTURE

Current `header-nav`: `Quickstart · Docs (How It Works, How Themes Work) · FAQ · About · Articles · Download`

Problems: `Docs` carries 2 children against ~27 shipped capability areas; `Quickstart` sits outside
`Docs` despite being the most doc-shaped page; `/install` is published but in NO menu at all; `FAQ`
and `About` as top-level peers of `Docs` is marketing-site shape, not developer-tool shape.

Target: `Docs` (Install → Quickstart → Concepts → Capabilities → Reference) · `Articles` · `About`,
with `Download` as the CTA. Shallow, predictable URLs serve crawlers and humans with one structure.

## Decision 3 — AI surface: make `/llms.txt` a COMPLETE index

`/llms.txt` already returns 200 but only lists what exists. Once the capability pages land it should
enumerate every page with a one-line description. Judged higher-leverage than per-page JSON-LD for an
assistant trying to learn what Tovu can do. JSON-LD was offered and deferred, not rejected.

## Execution ordering (why nothing ran immediately)

All three write `sites/tovu-com/content.db` and regenerate the tracked binary `content.seed.db`, and
the nav work touches `header-nav`, which `docs-scaffold` is editing right now. Concurrent agents
would clobber the binary seed. They run strictly after `docs-scaffold` reports.

## Still open

- Two `/quickstart` bugs found by the install-docs pass, deliberately unfixed: its `tovu serve`
  example omits the REQUIRED positional `<dir>` (so the printed command fails), and its closing CTA
  still links `/documentation`, renamed to `/docs` in `acbd454a`.
- `/download` remains an owner-owned placeholder (positioning).
- Landing-page copy, pending the owner's final positioning wording.

## Correction recorded

`ADS-memory/reports/2026-09-03-tovu-capability-ground-truth.md:193` claims `npx tovu init <dir>`
works. It does not: root `package.json` is `"private": true` and `npm view tovu` returns a live 404.
That line was inferred from `program.ts` without checking publish status. Anything built on that
report inherits the error — verify its other claims against code before relying on them.
