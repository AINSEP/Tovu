# Handoff: no-shells revision of C4, C8, C9a, C9-ui, C10 (2026-11-15, stopped at the 250k context line)

Done (planning files only; no repo edits, no commits, no tests):
- Revision sections appended to `sheets/C4.md` (§10), `C8.md` (§9), `C10.md`, `C9a.md`, `C9-ui.md`; they override the earlier text where they conflict.
- New: `sheets/C4-server-port-fold.md`, `sheets/C1-plus.md`, `sheets/C2-addendum.md`.
- Repoint TSVs (scripted): `C4.repoint.tsv`, `C8.repoint.tsv`, `C10.repoint.tsv`, `C1-plus.repoint.tsv`, `C2-addendum.repoint.tsv`; hand-built `C9-ui.repoint.tsv`.
- Scripts: `scripts/repoint-post.py` (raw census → lane TSV with DROP/KEEP/MANUAL, rename, phase), `scripts/repoint-summary.py`; configs in `scripts/census/{c4,c4-barrel,c8,c10,c1plus,c2add}*.json`.

Remaining:
- `C9a.repoint.tsv` not built (method in C9a.md revision item 3).
- C9a's two UNVERIFIED items and C9-ui/C10 mount-list CHECKs left for executors.
- The old body text of each sheet still contains "re-export" wording; the appended revision sections win. A cleanup pass could fold them in.
- Census caveat: a Jini package (not the source) re-exporting a moved name (e.g. `chat/src/core/agentic/index.ts` capability types) is emitted as a repoint, not DROP; decide per row.

Open questions: server-port Q4 (body limits) is still open (C4 had mixed it up with DESIGN Q4); C10 zod-in-protocol API (recommended `A2uiPropsValidator` + `parseDynamicValue`, owner to confirm).
