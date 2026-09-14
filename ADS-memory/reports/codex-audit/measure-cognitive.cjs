// Static analysis only: reads committed source text; never imports application modules.
const fs = require('node:fs');
const cp = require('node:child_process');
const { Linter } = require('eslint');
const parser = require('typescript-eslint').parser;
const sonarjs = require('eslint-plugin-sonarjs');
const dir = 'ADS-memory/reports/codex-audit';
const inventory = JSON.parse(fs.readFileSync(`${dir}/commit-inventory.json`, 'utf8'));
const files = [...new Set(inventory.commits.flatMap(c => c.code))].filter(p => /\.[cm]?[jt]sx?$/.test(p));
const linter = new Linter();
const results = [];
for (const file of files) {
  const source = cp.spawnSync('git', ['show', `${inventory.head}:${file}`], {encoding:'utf8', maxBuffer:5*1024*1024});
  if(source.status !== 0) { results.push({file, skipped:'absent at HEAD'}); continue; }
  const config = { files:['**/*.{ts,tsx,js,jsx,mts,cts,cjs,mjs}'], languageOptions: {parser, parserOptions:{ecmaVersion:'latest',sourceType:file.endsWith('.cjs')?'commonjs':'module',ecmaFeatures:{jsx:true}}}, plugins:{sonarjs}, rules:{'sonarjs/cognitive-complexity':['error',9]} };
  const messages = linter.verify(source.stdout, config, {filename:file});
  results.push({file,messages:messages.map(m=>({line:m.line,column:m.column,rule:m.ruleId,fatal:!!m.fatal,message:m.message}))});
  fs.writeFileSync(`${dir}/cognitive-results.json`, JSON.stringify({head:inventory.head,threshold:9,note:'Isolated static SonarJS cognitive rule, not repository full ESLint configuration. Tests excluded. Source read from Git HEAD, no application code executed.',results},null,2)+'\n');
}
console.log(JSON.stringify({files:results.length,findings:results.filter(r=>r.messages?.length).map(r=>r)}));
