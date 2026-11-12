#!/usr/bin/env bash
# Post-processing (report-only): absolute lcov paths -> coverage-all-files.ts per repo -> coverage.tsv/totals -> failures.tsv.
set -u
export PATH=$HOME/.local/node24/bin:$PATH
C=/tmp/claude-0/cov; O=/home/user/Tovu/development/cloud/quality-1111/cov; S=$O/scripts; A=$C/abs; mkdir -p $A
# Tovu inputs (--exclude development/cloud: this audit's own scripts; --exclude sites: no tracked source lives there; test runs leave untracked staging files under sites/tovu-dev/ that would otherwise enter the denominator or vanish mid-read)
T=()
for f in $C/tovu/shard-*.lcov.info; do [ -s "$f" ] && node $S/lcov-abs.mjs "$f" /home/user/Tovu "$A/tovu-$(basename $f)" && T+=(--coverage "$A/tovu-$(basename $f)"); done
for f in $C/desktop/*.lcov.info; do [ -s "$f" ] && node $S/lcov-abs.mjs "$f" /home/user/Tovu/apps/desktop "$A/$(basename $f)" && T+=(--coverage "$A/$(basename $f)"); done
[ -s $C/admin/lcov.info ] && node $S/lcov-abs.mjs $C/admin/lcov.info /home/user/Tovu/apps/admin $A/admin.lcov.info && T+=(--coverage $A/admin.lcov.info)
cd /home/user/Tovu
node --import tsx development/scripts/coverage-all-files.ts --repo /home/user/Tovu --exclude sites --exclude development/cloud --out $C/report-tovu "${T[@]}" | tee $O/raw/coverage-all-files-tovu.txt
# Jini inputs
J=()
for d in $C/jini/*/; do p=$(basename $d); [ -s "$d/lcov.info" ] || continue
  pkg=${p%-kernel}; node $S/lcov-abs.mjs "$d/lcov.info" /home/user/Jini/packages/$pkg "$A/jini-$p.lcov.info" && J+=(--coverage "$A/jini-$p.lcov.info"); done
node --import tsx development/scripts/coverage-all-files.ts --repo /home/user/Jini --root packages --out $C/report-jini "${J[@]}" | tee $O/raw/coverage-all-files-jini.txt
cp $C/report-tovu/coverage-all-files.md $O/raw/coverage-all-files-tovu.md; cp $C/report-jini/coverage-all-files.md $O/raw/coverage-all-files-jini.md
node $S/build-coverage-table.mjs $O "Tovu=/home/user/Tovu=$C/report-tovu/coverage-all-files.json=$C/admin" "Jini=/home/user/Jini=$C/report-jini/coverage-all-files.json=$C/jini" | tee $O/raw/coverage-table.txt
# failures
F=()
for f in $O/raw/tovu-root-shard-*.tap.txt $O/raw/tovu-desktop-*.tap.txt; do F+=("Tovu:tap:$f"); done
# partial TAP of the stopped original shards 5/6 (files 1-67 / 1-39 ran to completion there); 5a/6a are subsets, not used
for f in $O/raw/aborted/tovu-root-shard-5.tap.txt $O/raw/aborted/tovu-root-shard-6.tap.txt; do [ -s "$f" ] && F+=("Tovu:tap:$f"); done
F+=("Tovu:vitest:$C/admin-results.json")
for f in $C/jini/*.results.json; do F+=("Jini:vitest:$f"); done
[ -s $O/raw/jini-test-commerce-nodetest.txt ] && F+=("Jini:tap:$O/raw/jini-test-commerce-nodetest.txt")
node $S/extract-failures.mjs $O/failures.tsv "${F[@]}" | tee $O/raw/failures-extract.txt
