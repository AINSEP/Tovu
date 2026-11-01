import assert from 'node:assert/strict';
import test from 'node:test';
import { toolApprovalPresentation } from '@jini-ai/ui/mcp-ui/surfaces';
import { APPROVAL_COPY, approvalText } from '../../contracts/core/approval-i18n.js';
import { ALL_CHAT_DELETE_TOOLS } from '../permanent-delete-tool-gate.js';
import { realToolCatalog } from './real-tool-catalog.fixture.js';

/** Owner 10-31 (open-bugs.md): a confirm card's Details showed "Host"/"Repository" in English in every
 * locale. Schema `title`s already reach the card through `approvalText` (tool-approval-policy.ts);
 * the dictionary just never carried them. Same path the policy uses: catalog schema -> presentation. */
test('every schema field title on an approval card is translated in every supported locale', async () => {
  // Use production registration: a new contributor or nested field title must join this guard.
  const { registry } = await realToolCatalog({}, { permanentDeletePolicy: ALL_CHAT_DELETE_TOOLS });
  const missing = new Set<string>();
  const titles = new Set<string>();
  for (const tool of registry.list({})) {
    const english = toolApprovalPresentation({ descriptor: tool }, { text: ({ key }) => key }).labels;
    for (const locale of Object.keys(APPROVAL_COPY).filter((code) => code !== 'en')) {
      const labels = toolApprovalPresentation({ descriptor: tool }, { text: ({ key }) => approvalText({ locale, key }) }).labels;
      for (const [path, title] of Object.entries(english)) {
        titles.add(title);
        if (labels[path] === title) missing.add(`${tool.id}.${path} "${title}" is untranslated in ${locale}`);
      }
    }
  }
  assert.ok(titles.size > 0, "the production catalog must exercise schema titles");
  assert.deepEqual([...missing], []);
});
