#!/bin/bash
# Sequential L10 "after" re-score on throwaway copies (inPlace, never the committed dirs).
export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Jini/packages
run() { pkg=$1; name=$2; mutate=$3
  rm -rf $pkg-after; cp -a $pkg $pkg-after; rm -rf $pkg-after/coverage $pkg-after/.stryker-tmp
  CONC=1 /root/stryker/mkcfg.sh $PWD/$pkg-after $name "$mutate"
  (cd $pkg-after && timeout 2400 /root/stryker/node_modules/.bin/stryker run stryker.$name.json > /tmp/st-$name.log 2>&1; echo "exit $?" >> /tmp/st-$name.log)
  rm -rf $pkg-after
}
run analytics analytics-after '["src/ingest.ts"]'
run desktop-host desktop-after '["src/render-service.ts"]'
run cli cli-after '["src/prompt.ts","src/redact.ts"]'
run artifacts artifacts-after '["src/manifest.ts"]'
run diagnostics diagnostics-after '["src/redaction.ts","src/web-evidence/request-guard.ts","src/core/secrets-only.ts"]'
echo QUEUE-DONE > /tmp/l10-queue.done
