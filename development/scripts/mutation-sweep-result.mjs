/**
 * Classifies one sweep subprocess result without running tests or touching source files.
 * @param {{status: number | null, error?: {code?: string}, stdout?: string, stderr?: string}} result
 * @returns {{pass: boolean, why: 'pass' | 'timeout' | 'invalid-mutant' | 'fail'}}
 * @complexity O(n) time and space for n characters of captured output.
 */
export function classifyMutationTestResult(result) {
  if (result.error && result.error.code === 'ETIMEDOUT') return { pass: false, why: 'timeout' };
  if (result.status === 0) return { pass: true, why: 'pass' };

  // A nonzero exit is NOT automatically proof that a test observed the guard. The mutation may
  // simply not have compiled — the `??`-dropping regex can emit `a ?? new Foo()` -> `a Foo()` —
  // and a transform error exits nonzero exactly like a real assertion failure. Scoring those as
  // "killed" is how a sweep manufactures a clean result. Separate them.
  // Match case-sensitive diagnostics: vitest's `expected 'x'` is an assertion, while bare
  // `esbuild`, `Unexpected token`, or `Cannot find module` can occur in runtime failures/stacks.
  // A located esbuild ERROR is always a compile diagnostic; keep other forms anchored so
  // assertion messages merely quoting those diagnostics still count as kills.
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  const invalid = /^\s*(?:#\s*)?(?:SyntaxError(?: \[ERR_[A-Z_]*SYNTAX\])?:|(?:(?:Error(?: \[TransformError\])?|TransformError):|\[plugin:[^\]\r\n]+\])[^\r\n]*\bTransform failed\b|Transform failed\b|Parse error:|(?:Error|RollupError):\s*(?:Failed to parse source for import analysis\b|Parse failure\b))/m.test(out)
    || /^\s*(?:#\s*)?\S+:\d+:\d+:\s*ERROR:/m.test(out)
    || /^\s*(?:#\s*)?(?:[^\n]*?(?::\d+(?::\d+)?|\(\d+,\d+\)):\s*)?(?:ERROR:\s*Expected ["']|(?:error )?TS\d{4}:)/m.test(out);
  return { pass: false, why: invalid ? 'invalid-mutant' : 'fail' };
}
