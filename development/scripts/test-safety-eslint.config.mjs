import tseslint from 'typescript-eslint';

// A focused guard, run on the diff by check:test-safety (check-test-safety-diff.ts), separate from the
// repo's unrelated complexity backlog.
export default [{
  // Every TypeScript root `npm run test:ci` runs under tsx; check:test-safety applies it to changed files only.
  files: ['apps/website', 'apps/site-chat', 'packages/*/src', 'development/scripts', 'development/eslint-rules']
    .flatMap(root => [`${root}/**/__tests__/**/*.ts`, `${root}/**/*.test.ts`]),
  languageOptions: { parser: tseslint.parser },
  linterOptions: { noInlineConfig: true },
  rules: {
    // Node synthesizes a missing assert.ok message by reparsing the source. With tsx this can
    // pin the event loop, so even --test-timeout cannot interrupt a failing assertion.
    'no-restricted-syntax': ['error', ...[
      'CallExpression[callee.name="assert"][arguments.length<2]',
      'CallExpression[callee.object.name="assert"][callee.property.name=/^(ok|strict)$/][arguments.length<2]',
      'CallExpression[callee.object.object.name="assert"][callee.object.property.name="strict"][callee.property.name="ok"][arguments.length<2]',
    ].map(selector => ({ selector, message: 'Supply an explicit assertion message to prevent Node source-message synthesis from hanging tsx.' }))],
  },
}];
