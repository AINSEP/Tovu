// ESLint formatter API supplies positional results; no separate analyzer/runner needed.
export default function format(results, options = {}) {
  const counts = new Map();
  let warnings = 0;
  let errors = 0;
  const diagnostics = [];
  for (const result of results) {
    warnings += result.warningCount;
    errors += result.errorCount;
    for (const message of result.messages) {
      const rule = message.ruleId ?? '(parse/config error)';
      counts.set(rule, (counts.get(rule) ?? 0) + 1);
      if (message.severity === 2) {
        diagnostics.push(`${result.filePath}:${message.line ?? 0}:${message.column ?? 0} ${message.message}`);
      }
    }
  }
  return [
    `SonarJS: ${results.length} files, ${warnings} warnings, ${errors} errors`,
    ...[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([rule, count]) => `${rule}: ${count}`),
    ...diagnostics,
    '',
  ].join('\n');
}
