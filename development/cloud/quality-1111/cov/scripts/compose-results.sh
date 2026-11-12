#!/usr/bin/env bash
# RESULTS.md = RESULTS-head.md + generated tables (coverage, failures, test quality) + RESULTS-static.md + RESULTS-tail.md.
set -u
export PATH=$HOME/.local/node24/bin:$PATH
O=/home/user/Tovu/development/cloud/quality-1111/cov; cd $O
TQ=$(node -e '
const rows=require("fs").readFileSync("test-quality.tsv","utf8").trim().split("\n").slice(1).map(l=>l.split("\t"));
const cols=["tests","no_assert","weak_only","snapshot_only","indirect","mocks_uut","skip","only","todo"];const t={};
for(const r of rows){t[r[0]]??={files:0};t[r[0]].files++;cols.forEach((c,i)=>t[r[0]][c]=(t[r[0]][c]||0)+Number(r[i+2]||0));}
console.log("| repo | test files | "+cols.join(" | ")+" |\n| --- | ---: | "+cols.map(()=>"---:").join(" | ")+" |");
for(const[k,v] of Object.entries(t)) console.log(`| ${k} | ${v.files} | `+cols.map(c=>v[c]).join(" | ")+" |");')
{ cat RESULTS-head.md; echo; [ -f RESULTS-summary.md ] && cat RESULTS-summary.md && echo; echo "## Generated tables"; echo; node scripts/results-tables.mjs .; echo; awk -v tq="$TQ" '{ if ($0=="TOTALS_TQ") print tq; else print }' RESULTS-static.md; echo; [ -f RESULTS-tail.md ] && cat RESULTS-tail.md; } > RESULTS.md
wc -l RESULTS.md
