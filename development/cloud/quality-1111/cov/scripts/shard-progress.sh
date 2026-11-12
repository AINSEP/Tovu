#!/usr/bin/env bash
# Prints each running shard's position: the per-file child process's test file -> its line in the shard list.
L=/tmp/claude-0/cov/tovu
ps -eo args | grep -v 'composed-bundle-env.ts --test ' | grep -oE '(apps|content|packages|development)/[^ ]+\.test\.(ts|mjs)' | sort -u | while read f; do
  grep -nxF "$f" $L/shard-*.txt | sed -E "s#^$L/shard-([0-9])\.txt:([0-9]+):.*#shard \1 at \2/~394#"
done | sort
