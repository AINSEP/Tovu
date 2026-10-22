import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalClassFor, federatedApprovalClassFor } from '../tool-approval-policy.js';
import { ASSISTANT_EXECUTION_APPROVAL_SETTINGS, type ToolApprovalPolicy } from '../../contracts/headless/assistant-tool-approval-policy.js';

test('TW3 local classification preserves each dynamic rule and rejects inherited ids', () => {
  const cases: [ToolApprovalPolicy['rule'], unknown, string][] = [
    ['plugin-enable', { enabled: false }, 'edit'], ['plugin-enable', {}, 'escalation'], ['plugin-enable', Object.assign([], { enabled: false }), 'escalation'],
    ['execution-setting', ASSISTANT_EXECUTION_APPROVAL_SETTINGS[0], 'escalation'], ['execution-setting', {}, 'edit'],
    ['export-commit', { dryRun: true }, 'edit'], ['export-commit', null, 'publish'],
    ['page-control', { handle: 'trash-purge-confirm' }, 'delete'],
    ['http-method', { method: 'delete' }, 'delete'], ['http-method', { method: 2 }, 'edit'],
    [undefined, [], 'read'],
  ];
  for (const [rule, input, expected] of cases) {
    assert.equal(approvalClassFor({ toolId: 'page.click', input }, { policy: { class: 'read', confirmation: 'direct', rule } }), expected);
  }
  assert.throws(() => approvalClassFor({ toolId: 'toString', input: {} }), /has no approval classification/);
});

test('TW3 a rule name that is only inherited (not an own classifier) falls back to the static class', () => {
  const inherited = 'toString' as unknown as ToolApprovalPolicy['rule'];
  assert.equal(approvalClassFor({ toolId: 'page.click', input: { method: 'DELETE' } }, { policy: { class: 'edit', confirmation: 'direct', rule: inherited } }), 'edit');
});

test('TW3 federated classification pins action, declaration, hint and fallback precedence', () => {
  const cases: [Parameters<typeof federatedApprovalClassFor>[0], string][] = [
    [{ input: { action: 'trash delete' } }, 'trash'],
    [{ input: { operation: 'delete', status: 'published' } }, 'delete'],
    [{ input: { action: 'restore', overwrite: true } }, 'restore-over-existing'],
    [{ input: { action: 'restore', replaceExisting: true } }, 'restore-over-existing'],
    [{ input: { action: 'restore_over_existing' } }, 'restore-over-existing'],
    [{ input: { action: 'deploy' } }, 'publish'], [{ input: { status: 'published' } }, 'publish'],
    [{ input: { published: false } }, 'publish'],
    [{ input: {}, description: 'This tool publishes pages' }, 'publish'],
    [{ input: {}, description: 'Moves pages to the trash' }, 'trash'],
    [{ input: {}, description: 'Restores over existing pages' }, 'restore-over-existing'],
    [{ input: {}, description: 'Permanently removes pages' }, 'delete'],
    [{ input: {}, name: 'restorePage', annotations: { destructiveHint: true } }, 'edit'],
    [{ input: {}, description: 'Restore pages' }, 'edit'],
    [{ input: {}, name: 'trash_page' }, 'trash'], [{ input: {}, name: 'sendPage' }, 'publish'],
    [{ input: {}, name: 'delete-page' }, 'delete'],
    [{ input: {}, annotations: { destructiveHint: true } }, 'delete'],
    [{ input: null, description: 'Reads published content' }, 'replace-secret'],
  ];
  for (const [input, expected] of cases) assert.equal(federatedApprovalClassFor(input, { fallbackClass: 'replace-secret' }), expected, JSON.stringify(input));
  assert.equal(federatedApprovalClassFor({ input: Object.assign([], { action: 'delete' }) }), 'edit');
});
