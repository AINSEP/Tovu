import { describe, test } from 'node:test';
import { RuleTester, type Rule } from 'eslint';
import rule from '../effect-resource-cleanup.mjs';

RuleTester.describe = describe;
RuleTester.it = test;
for (const legacy of [false, true]) {
  new RuleTester().run(`effect-resource-cleanup (${legacy ? 'getSourceCode fallback' : 'sourceCode only'})`, {
    ...rule,
    create(context: Rule.RuleContext) {
      // Exercise both API generations with ESLint's real parser and report pipeline.
      return rule.create(Object.create(context, {
        sourceCode: { value: legacy ? undefined : context.sourceCode },
        getSourceCode: { value: legacy ? () => context.sourceCode : undefined },
      }));
    },
  }, {
    valid: [
      'useEffect(() => { const socket = new WebSocket("/events"); return () => socket.close(); }, []);',
      'useEffect(() => { /* leak-lint-ignore: tab-lifetime connection */ new EventSource("/events"); }, []);',
    ],
    invalid: [
      {
        code: 'useEffect(() => { new WebSocket("/events"); return () => clearInterval(timer); }, []);',
        errors: [{ messageId: 'unmatchedCleanup', data: { kind: 'WebSocket', closeText: '.close(' } }],
      },
    ],
  });
}
