// usage: node mk.mjs out.json name mutate1,mutate2...
import fs from 'fs';
const [,, out, name, list] = process.argv;
const mutate = list.split(',').concat(['!**/__tests__/**','!**/*.test.ts','!**/*.spec.ts','!**/*.d.ts','!**/*.tsx']);
fs.writeFileSync(out, JSON.stringify({testRunner:'vitest',vitest:{configFile:'vitest.stryker.config.ts'},mutate,coverageAnalysis:'perTest',concurrency:3,incremental:true,incrementalFile:`/root/stryker/reports/${name}.incremental.json`,mutator:{excludedMutations:['StringLiteral']},reporters:['json','clear-text','progress-append-only'],jsonReporter:{fileName:`/root/stryker/reports/${name}.json`},clearTextReporter:{allowEmojis:false,logTests:false,maxTestsToLog:0},tempDirName:'.stryker-tmp',cleanTempDir:true,disableTypeChecks:true},null,1));
