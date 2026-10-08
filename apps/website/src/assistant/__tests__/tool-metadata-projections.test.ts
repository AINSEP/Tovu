import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { nativeToolMetadata } from '../../contracts/core/tool-metadata/index.js';
import { TOOL_SEARCH_KEYWORDS } from '../tool-search-keywords.js';
import { DOC2QUERY } from '../tool-search-doc2query.js';
import { TOOL_APPROVAL_POLICY, POLICY_CONFIRMATION_TOOL_IDS } from '../../contracts/headless/assistant-tool-approval-policy.js';
import { SECRET_FORM_CARD_DEFINITIONS, SECRET_FORM_TOOL_IDS } from '../../contracts/headless/secret-form-cards.js';
import { MCP_UI_REDEEMABLE_TOOL_IDS, isMcpUiToolCallPermitted } from '../mcp-ui-tool-calls.js';
import { realToolCatalog } from './real-tool-catalog.fixture.js';

/** Phase 16 baseline captured from the shared working tree before projection edits, with exact
 * search strings. Relocated prose is retained data, never counted as removed implementation. */
const baseline = JSON.parse(readFileSync(new URL('./fixtures/tool-metadata.baseline.json', import.meta.url), 'utf8')) as {
  keywords: Record<string, string>; queries: Record<string, string[]>; approvals: Record<string, unknown>;
  policyConfirmationIds: string[]; secretForms: Record<string, unknown>; redeemableIds: string[]; exchangeOnlyIds: string[];
};

test('projected search, approval and callback metadata exactly matches the pre-change baseline', () => {
  assert.deepEqual(TOOL_SEARCH_KEYWORDS, baseline.keywords);
  assert.deepEqual(DOC2QUERY, baseline.queries);
  assert.deepEqual(TOOL_APPROVAL_POLICY, baseline.approvals);
  assert.deepEqual(SECRET_FORM_CARD_DEFINITIONS, baseline.secretForms);
  assert.deepEqual([...POLICY_CONFIRMATION_TOOL_IDS].sort(), [...baseline.policyConfirmationIds].sort());
  assert.deepEqual([...SECRET_FORM_TOOL_IDS].sort(), Object.keys(baseline.secretForms).sort());
  assert.deepEqual([...MCP_UI_REDEEMABLE_TOOL_IDS].sort(), [...baseline.redeemableIds].sort());
  assert.deepEqual([...nativeToolMetadata.exchangeOnlyIds].sort(), [...baseline.exchangeOnlyIds].sort());
  assert.equal(nativeToolMetadata.byId.credential_save?.approval?.input, 'human-form');
  assert.equal(nativeToolMetadata.byId.plugins_set_enabled?.approval?.rule, 'plugin-enable');
});

test('every baseline ID retains its exchange and fresh-callback refusal rules', () => {
  for (const id of Object.keys(nativeToolMetadata.byId)) {
    const admitted = baseline.redeemableIds.includes(id);
    assert.equal(isMcpUiToolCallPermitted(id, true), admitted, `${id} answering an exchange`);
    assert.equal(isMcpUiToolCallPermitted(id, false), admitted && !baseline.exchangeOnlyIds.includes(id), `${id} executing a fresh callback`);
  }
  assert.equal(isMcpUiToolCallPermitted('unknown_tool', true), false);
  assert.equal(isMcpUiToolCallPermitted('mcp__remote__delete', false), false);
  assert.equal(isMcpUiToolCallPermitted('mcp__remote__delete', true), true);
});

test('the production domain registrations carry their projected action policy', async () => {
  const { registry } = await realToolCatalog();
  for (const descriptor of registry.list({})) {
    assert.ok(descriptor.metadata?.approval, `${descriptor.id} must carry its owning registration's policy`);
    assert.deepEqual(descriptor.metadata, nativeToolMetadata.byId[descriptor.id], descriptor.id);
  }
});
