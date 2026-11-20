Completed **10/16 entries**: F01–04, F06–07, F09–10, F15–16. IDs follow dispatch order.

Stopped, with original source retained:

- **F05:** private `this` access prevents the permitted module-level extraction.
- **F08:** remaining size comes from object properties rather than extractable statements.
- **F11:** trial splits still exceeded limits; further splitting conflicted with live state and error cleanup.
- **F12–14:** browser serialization prevents module-level helper access; dependent enclosing-function limits remain blocked.

Changed eight source files. Only same-file callers were repointed. Debt rows removed/added: **0/0**. Tests added: **none**; mutations: **N/A**. No tests, builds, installs, type-checks, or linters ran. `.git` remains untouched.

Files over 500 physical lines: admin rules **502**, send pipeline **621**, architecture script **1055**; unchanged HTML store **605** and desktop main **1163**.

Created [COMMIT-PLAN.md](SCR/c-tv-fn50-3/COMMIT-PLAN.md) with per-item commit messages, exact paths, blockers, and trial deletions. Coordinator commits.
