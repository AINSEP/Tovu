#!/bin/bash
# Step 6/7 rg counts over prod files. Output: typesafety.tsv (repo, pattern, file, line, text) and summary
D=/home/user/Tovu/development/cloud/quality-1111/static
declare -A P=(
 [as_any]='\bas any\b'
 [colon_any]=':\s*any\b'
 [ts_ignore]='@ts-ignore'
 [ts_expect_error]='@ts-expect-error'
 [ts_nocheck]='@ts-nocheck'
 [eslint_disable]='eslint-disable'
 [non_null_bang]='[\w\)\]]!(\.|\[|\)|;|,|\s*$)'
 [await_import]='await import\('
)
echo -e "repo\tcheck\tfile\tline\ttext" > $D/typesafety.tsv
for repo in tovu jini; do
  root=/home/user/$( [ $repo = tovu ] && echo Tovu || echo Jini )
  cd $root
  for k in "${!P[@]}"; do
    # non-null: ts/tsx only, exclude != and !==
    if [ $k = non_null_bang ]; then files=$(grep -E '\.(ts|tsx|mts|cts)$' $D/raw/files-$repo.txt); else files=$(cat $D/raw/files-$repo.txt); fi
    echo "$files" | xargs rg -n --no-heading --field-match-separator=$'\t' -P "${P[$k]}" 2>/dev/null | { if [ $k = non_null_bang ]; then grep -Pv '^[^\t]+\t\d+\t\s*(//|\*)'; else cat; fi; } \
      | awk -v r=$repo -v k=$k -F'\t' '{f=$1;l=$2;t=$3;for(i=4;i<=NF;i++)t=t" "$i;if(length(t)>160)t=substr(t,1,160);print r"\t"k"\t"f"\t"l"\t"t}' >> $D/typesafety.tsv
  done
done
