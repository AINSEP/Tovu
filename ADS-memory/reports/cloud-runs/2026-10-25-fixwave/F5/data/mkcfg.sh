#!/bin/bash
# usage: mkcfg.sh <pkgdir> <name> <mutate-json-array> [alias]
dir=$1; name=$2; mutate=$3
if [ -n "$4" ]; then alias="resolve: { alias: [{ find: '@jini-ai/plugins/host', replacement: '$4' }] },"; else alias=""; fi
cat > $dir/vitest.stryker.config.ts <<EOT
import { defineConfig } from 'vitest/config';
export default defineConfig({
  $alias
  test: { testTimeout: 30000, hookTimeout: 30000, exclude: ['**/node_modules/**', '**/dist/**', '**/.stryker-tmp/**'] },
});
EOT
cat > $dir/stryker.$name.json <<EOT
{"testRunner":"vitest","vitest":{"configFile":"vitest.stryker.config.ts"},"mutate":$mutate,"coverageAnalysis":"perTest","concurrency":${CONC:-2},"incremental":false,"mutator":{"excludedMutations":["StringLiteral"]},"reporters":["json","clear-text","progress-append-only"],"jsonReporter":{"fileName":"/root/stryker/reports/$name.json"},"inPlace":true,"tempDirName":".stryker-tmp","cleanTempDir":true,"timeoutMS":10000,"disableTypeChecks":true}
EOT
