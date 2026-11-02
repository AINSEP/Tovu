import assert from 'node:assert/strict';
import test from 'node:test';
import { Linter } from 'eslint';
import config from '../test-safety-eslint.config.mjs';

const filename = `${process.cwd()}/apps/website/src/example/__tests__/case.test.ts`;
function messages(code: string) {
  return new Linter().verify(code, config, { filename });
}

for (const code of ['assert.ok(result);', 'assert.ok(\n results.some(value => value.ok)\n);', 'assert(result);', 'assert.strict.ok(result);', 'assert.strict(result);']) {
  test(`the test-safety lint guard rejects message synthesis: ${code}`, () => {
    const result = messages(`import assert from 'node:assert/strict'; ${code}`);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.ruleId, 'no-restricted-syntax');
    assert.match(result[0]?.message ?? '', /explicit assertion message/);
  });
}
test('explicit messages and other assertions remain valid', () => {
  assert.deepEqual(messages(`import assert from 'node:assert/strict';
    assert.ok(result, 'the response must exist');
    assert(result, 'the response must exist');
    assert.equal(result, true);
    assert.deepEqual(result, {});
  `), []);
});
