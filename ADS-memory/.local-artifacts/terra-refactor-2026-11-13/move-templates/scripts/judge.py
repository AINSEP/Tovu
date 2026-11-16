#!/usr/bin/env python3
"""Hand judgments for uncertain rows; appends a `judged` column to CLASSIFY.tsv (and may override cost)."""
import csv, sys
OUT = sys.argv[1]
J = {  # feature: (cost override or "", note)
 "website/contracts/core/commands": ("Sonnet-sheet", "REPOINT + same-commit update of write-path-inventory / coverage-integrity baselines (d1 excluded shim)"),
 "website/platform/observability": ("Sonnet-sheet", "SHIM excluded by d1 (not a pure re-export or why-comment missing in Jini): doc-only Jini commit moves the comment, then REPOINT"),
 "admin/components/CodeView": ("", "pilot E04 recipe is the worked example; run it, do not re-plan"),
 "website/features/email-templates": ("", "pilot E01 covers render.ts; operations.ts is the remaining SPLIT"),
 "site-chat/(src)": ("", "pilot E03 landed (Tovu 9484d35f9); the rest: ~770 lines duplicate Jini chat embed (admin-core survey) -> DEDUPE onto chat/embed, Jini needs 90 s idle timeout + confirmation UI first (HARDEN)"),
 "website/server/inbound/shared": ("", "pilot E05 (trust-proxy) is the SERVER worked example"),
 "website/server/runtime/composition": ("needs Opus", "pilot E02 (provider-revision-watch) is the SPLIT+port worked example; most other files are composition wiring that should STAY: Opus re-labels per file before any sheet"),
 "website/server/inbound/admin-http": ("needs Opus", "130 route files: after server-port lands, Opus writes 3 worked SERVER sheets, then Sonnet+Opus-review per route group (by URL prefix)"),
 "website/server/inbound/public-http": ("needs Opus", "same as admin-http; 9k lines in 15 files: large handlers, split first (size gate)"),
 "website/server/inbound/assistant": ("needs Opus", "31 console calls: report port + redaction before any move"),
 "desktop/(src)": ("needs Opus", "follow desktop survey order (ipc/lifecycle -> supervision -> registry); targets are EXISTING homes (desktop-host, sidecar, platform/fs, ui); packaged-desktop proof per batch"),
 "admin/features/security": ("needs Opus", "owner decided 11-10: retire Tovu security, port Tovu-only behaviour into Jini admin/security first (HARDEN); one Opus parity list, then Sonnet sheets"),
 "admin/features/roles": ("", "DELETE-AFTER-PARITY onto a new user-management/react/roles (admin-core survey); HARDEN template"),
 "website/features/external-mcp": ("", "hosted MCP needs owner approval (pilot rejection)"),
 "admin/lib": ("needs Opus", "grab-bag folder: classify per file, never as one unit; tiptap/html2canvas files wait for the editor-surface decision"),
 "admin/features/posts": ("needs Opus", "19 tiptap deps: MOVE-AFTER(Jini editor surface) - no Jini editor surface exists; owner decision before any sheet"),
 "website/features/deployments": ("", "aws4fetch is vendor code: goes to its provider plugin, never devops core (vendor rule)"),
 "admin/features/plugins": ("needs Opus", "split the two plugin families first (admin survey); 17 HARDEN/parity files"),
 "website/features/theme": ("", "theme engine lane T (~8.5k): Opus; menu renderers MOVE-AFTER navigation/render-entry"),
 "website/assistant": ("", "47 files: slice by sub-area (tools, prompts, runs); zod deps need the new-dep decision"),
 "website/features/webmcp": ("", "a survey file is gone in the terra clone: re-run signals before the sheet"),
 "website/platform/db/sqlite": ("", "kysely new dep in the target; D2 row waits"),
 "website/features/publish-content": ("", "MOVE-AFTER(publish-content framework in Jini) for 6 files"),
}
rows = list(csv.DictReader(open(f"{OUT}/CLASSIFY.tsv"), delimiter="\t"))
cols = list(rows[0].keys()) + ["judged"]
for r in rows:
    c, n = J.get(r["feature"], ("", ""))
    if c: r["fill_in_cost"] = c
    r["judged"] = n or "-"
with open(f"{OUT}/CLASSIFY.tsv", "w") as fh:
    fh.write("\t".join(cols) + "\n")
    for r in rows: fh.write("\t".join(str(r[k]) for k in cols) + "\n")
missing = set(J) - {r["feature"] for r in rows}
print("judged", sum(r["judged"] != "-" for r in rows), "unknown keys", missing)
