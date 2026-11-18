#!/usr/bin/env python3
"""Build the accepted-edge TSV from EDGES.tsv (classify-edges.py output). Plan tooling.
usage: make-accepted.py <EDGES.tsv> > accepted.tsv
Accepts OLD, MOVED and RENAMED rows and the DESIGNED edges named below (by exact edge text).
Every other NEW row is listed on stderr and the script exits 1: such an edge needs its own decision
(arch-120 DESIGN.md section 3), it is never accepted by this script."""
import csv, sys
F = "apps/website/src/features/"
DESIGNED = {
    F + "site-backup/static-site-packager.ts -> " + F + "source-control/index.ts":
        "import-cycle DESIGN rev2 section 2.5 (S5): site-backup implements the StaticSitePackagerPort that source-control owns; "
        "plan/import-cycle-design-2026-11-16:designs/import-cycles/DESIGN.md lines 238-260",
    F + "source-control/write-port.ts -> " + F + "custom-credentials/write-files-validation.ts":
        "import-cycle DESIGN rev2 section 2.3(b) (S3b): write-port keeps calling validateRepositoryTarget, downward rank 6->3; "
        "plan/import-cycle-design-2026-11-16:designs/import-cycles/DESIGN.md line 172",
}
EVIDENCE = {
    "OLD": lambda pair, names: "file edge present in the tree of 9240cbe1, the commit that created the baseline list (designs/arch-120/facts/imports.9240cbe1.tsv)",
    "MOVED": lambda pair, names: f"names {names} already crossed {pair} at 9240cbe1 (designs/arch-120/facts/imports.9240cbe1.tsv)",
    "RENAMED": lambda pair, names: f"PublishContentPorts was renamed TovuPublishPorts by 6fd46c35 (publish-engine P0.3); names {names} crossed {pair} at 9240cbe1 under the old name",
}
out, refused = ["edge\tclass\tevidence"], []
for eid, pair, kind, direction, prov, names, src, dst in csv.reader(open(sys.argv[1]), delimiter="\t"):
    edge = f"{F}{src} -> {F}{dst}"
    if prov in EVIDENCE: out.append(f"{edge}\t{prov}\t{EVIDENCE[prov](pair, names)}")
    elif edge in DESIGNED: out.append(f"{edge}\tDESIGNED\t{DESIGNED[edge]}")
    else: refused.append(f"{eid} {edge} ({names})")
print("\n".join(out))
for r in refused: print(f"NOT ACCEPTED (needs a decision): {r}", file=sys.stderr)
sys.exit(1 if refused else 0)
