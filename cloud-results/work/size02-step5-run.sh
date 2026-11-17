#!/bin/bash
set -e
export PATH=~/.local/node24/bin:$PATH
cd /home/user/Tovu
C=apps/website/src/server/runtime/composition
git checkout $C/app.ts
rm -rf $C/memory-deps/route-deps $C/memory-deps/create-route-deps-options.ts
node /tmp/claude-0/gen/gen.cjs > /dev/null
node /tmp/claude-0/gen/emit.cjs --write
python3 - <<'PY'
C='/home/user/Tovu/apps/website/src/server/runtime/composition'
s=open(C+'/app.ts').read()
a=s.index('export interface CreateRouteDepsOptions {')
b=s.index('/** Preserve optional plugin-runtime overrides')
block=s[a:b]
s=s[:a]+s[b:]
open(C+'/memory-deps/create-route-deps-options.ts','w').write('import type { RouteDeps } from "../../../routes/types.js";\nimport type { PublishContentSeedHashFn } from "#src/features/publish-content/seed-hash";\n\n'+block.rstrip()+'\n')
add='import { assembleMemoryRouteDeps } from "./memory-deps/route-deps/assemble.js";\nimport type { MemoryRootContext, MemoryRouteDeps } from "./memory-deps/route-deps/context.js";\nimport type { CreateRouteDepsOptions } from "./memory-deps/create-route-deps-options.js";\n'
i=s.index('\nimport ')
s=s[:i+1]+add+s[i+1:]
open(C+'/app.ts','w').write(s)
PY
node cloud-results/work/size-02-fiximports.cjs
