import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolRegistration } from '@jini-ai/core';
import { mediaViewImageAgentToolCatalog } from '../../features/media/view-image-tool.js';
import { catalog as mediaViewVideoAgentToolCatalog } from '../../features/media/view-video-tool.js';
import { webScreenshotAgentToolCatalog } from '../../features/web-screenshot/agent-tools.js';
import { demoImageAgentToolCatalog } from '../demo-image-tool.js';
import { applyBatchInputs, resolveBatchableTools } from '../batch-tool-inputs.js';

test('every registered image-returning viewer is excluded from batching', () => {
  // Coordinator F5 decision: viewer images must reach the model; Jini batch item JSON drops them.
  // Viewer-owned catalogs define the class independently of the host's batching opt-out list.
  // Optional write previews are cosmetic; web_fetch_page already refuses screenshot batch items.
  const viewers = [...mediaViewImageAgentToolCatalog, ...mediaViewVideoAgentToolCatalog,
    ...webScreenshotAgentToolCatalog, ...demoImageAgentToolCatalog];
  const registrations: ToolRegistration[] = viewers.map(({ name, inputSchema }) => ({
    descriptor: { id: name, inputSchema, sideEffects: 'none', readOnly: true },
    handler: async () => assert.fail('batch discovery must not execute a viewer'),
    policy: { authorize: () => 'allow' },
  }));
  const selected = new Set(resolveBatchableTools({ registrations }).map(tool => tool.toolId));
  const offered = applyBatchInputs({ registrations });
  assert.ok(viewers.length >= 4, 'cover all existing image-returning viewer catalogs');
  for (const [index, registration] of offered.entries()) {
    const { id, inputSchema } = registration.descriptor;
    assert.equal(selected.has(id), false, `${id} would lose its images in batch JSON`);
    assert.equal(registration, registrations[index], `${id} must keep its single-call handler`);
    const schema = inputSchema as { properties?: Record<string, unknown> };
    assert.equal(Object.hasOwn(schema.properties ?? {}, 'items'), false, `${id} must be offered singly`);
  }
});
