# website/features/web — PARTIAL: 1 executable slice (W1 #23). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`.
Skeleton: `make-sheet.py website/features/web --kind all` (delete-web, split-web). KIND-SUSPECT fired for `web-page.ts` (DELETE label, 2 runtime decls); it is correct: re-kind `web-page.ts` to DEDUPE/binding (keeps `WEB_FETCH_USER_AGENT`, a product string, and `fetchWebPage`).
untangle_overlap: C11.repoint.tsv:202 and C3.repoint.tsv:464, both on `tool-registrations.ts` → SP-web-* **execute after wave B merge**. DL-web-1 touches no overlapping file and may run now.

| id | files | status |
|---|---|---|
| DL-web-1 | html-document.ts (5, pure re-export, 0 prod importers) | READY (below) |
| DD-web-1 | web-page.ts (36; `WEB_FETCH_USER_AGENT` + `fetchWebPage` wrapper; 2 prod importers) | NOT FILLED (survey: composition passes the user agent through Jini `WebFetchPorts.userAgent`; needs the binding sheet) |
| SP-web-1 | agent-tools.ts (65) + tool-registrations.ts (81) -> `@jini-ai/platform/web` new `agent-tools.ts` | NOT FILLED; after C3/C11 (depends_on site-inspection per CLASSIFY) |

## Slice DL-web-1 (template T-DELETE)
```
id: DL-web-1
feature: website/features/web
tovu_file: apps/website/src/features/web/html-document.ts | blob f3231f8d6cc0191f09b4aac2f7fe858c5ddc0587
non_reexport_statements: 0
why_dead: pass-through to @jini-ai/platform/web (htmlToText, readHtmlDocument, stripActiveHtml, MAX_LINKS, MAX_IMAGES, types HtmlDocumentFacts, PageImage, PageLink); 0 production importers
tovu_file_after: delete
moved_bodies: -
census: (make-sheet resolved importers) only apps/website/src/features/web/__tests__/html-document.unit.test.ts:5 | static | "../html-document.js"
reach_check:
  - rg -n --no-heading -F "web/html-document" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/features/web/html-document.ts'
    expected before: only the test's line 5 ("../html-document.js" does not match; the command prints nothing). Also run rg -n -F "html-document.js" apps/website/src/features/web -> only __tests__/html-document.unit.test.ts:5. After: nothing.
importers: -
comment_refs: -
path_literals: -
baselines_to_edit: - (rg over *.json/*.mjs/*.yml for "features/web/html-document" prints nothing)
tests:
  - apps/website/src/features/web/__tests__/html-document.unit.test.ts | blob f506a1a5dc025b82949066bc0a08cf2dd467ec90 | relocate R1, then delete (git rm -q). Lines 9-14 assert only that the shim's exports are Jini's own bindings; with the shim deleted they have no subject (an export-surface test of the deleted file, as KINDS §1 "Risks" describes). Line 15 is a behaviour assertion and is relocated, not dropped.
relocations:
  - R1 from the test line 15 -> NEW Jini file packages/platform/src/web/__tests__/html-document-host-pin.test.ts (test-only Jini commit, no changeset), exactly:
    import { expect, test } from 'vitest';
    import { htmlToText } from '../html-document.js';

    /** Pinned by a host that used to re-export this parser: inline markup collapses to its text. */
    test('htmlToText reduces inline markup to its text', () => {
      expect(htmlToText({ html: '<p>Hello <b>world</b></p>' }).trim()).toBe('Hello world');
    });
jini_guards:
  - packages/platform/src/web/__tests__/html-document-host-pin.test.ts must not exist
  - packages/platform/src/web/html-document.ts contains "export function htmlToText({ html }: { html: string }" (line 248 at Jini b7666092)
jini_msg: "test(platform): pin htmlToText inline-markup collapse" | no changeset (test only)
tovu_msg: "refactor(web): delete the html-document re-export shim" | body "No production importer; its export-surface test goes with it, the one behaviour assertion moved to Jini."
extra_stops: if `rg -n "html-document" apps/website/src --glob '!**/__tests__/**' --glob '!**/node_modules/**'` prints any line in features/web, STOP.
```
