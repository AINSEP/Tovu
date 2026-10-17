TASK: prune development/todos.md (owner-approved 2026-10-17). Edit ONLY /Users/la/Programming/Tovu/development/todos.md. Do NOT run tests, typecheck, builds or installs. Do NOT stage or commit anything (never `git add`, never `git commit`). No other file may change.

The exact list is /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-17-todotriage-c2/prune-manifest.md. Every row is one item from todos.md (line numbers match the current file, 3,066 lines) with action REMOVE (verified DONE or STALE) or KEEP (OPEN or PARKED). The manifest covers lines 1-1631 and 2167-3066. Lines 1632-2166 (the "## Master Build Inventory (Everything)" section) are OUT OF SCOPE: leave them byte-for-byte unchanged.

Rules:
1. Remove each REMOVE item: its bullet / numbered item / checkbox / paragraph and its own continuation lines. Find it by the line number and confirm by its text; the "item" column is a paraphrase.
2. Never remove or reword a KEEP item. If a REMOVE item has nested children that are KEEP items (or are not in the manifest), keep those children and only drop the parent's own text when the children still read correctly; if unsure, keep the parent.
3. Remove a whole "## " section (heading + body) only when the manifest has a REMOVE row whose evidence says "all items done/stale" for that section, OR every manifest row inside that section is REMOVE. Otherwise keep the heading and all KEEP items under it, plus any intro prose those KEEP items need to make sense.
4. Keep the owner's wording of everything that remains. Do not renumber, reformat, re-sort, summarize or "tidy" anything. Only deletions (plus deleting a now-dangling blank line or a now-empty sub-heading).
5. Lines not covered by any manifest row (preamble, prose, history notes): keep them, unless they are inside a section you remove under rule 3.
6. When in doubt, KEEP.

REPORT (final message): `REMOVED SECTIONS:` list of headings; `REMOVED ITEMS: n`; `KEPT ON PURPOSE:` any REMOVE row you deliberately kept and why; `LINES: before -> after`; `CHANGED FILES:` (must be only development/todos.md); `NOT DONE:`.
