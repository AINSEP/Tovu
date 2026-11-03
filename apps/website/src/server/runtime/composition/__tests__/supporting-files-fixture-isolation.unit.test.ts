import assert from 'node:assert/strict';
import test from 'node:test';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createAssistantToolExecutor } from '#src/assistant/tool-recovery-preset';
import { installSupportingFilesFixture, SKILL_MARKDOWN } from '#src/features/agent-plugins/__tests__/fixtures/supporting-files';

test('supporting-file fixtures return installed skill bytes without shipped host overlay rules', async t => {
  const fixture = await installSupportingFilesFixture({});
  t.after(fixture.cleanup);
  const tool = fixture.registry.list({})[0]!;
  const executor = createAssistantToolExecutor({ registry: fixture.registry, surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) }, {});
  const result = await executor.execute({ principal: { id: 'owner' }, run: { id: 'fixture' }, toolId: tool.id, input: {} });
  assert.equal(result.status, 'completed');
  const output = result.output as { guidance: string; files: string[] };
  assert.equal(output.guidance, SKILL_MARKDOWN);
  assert.deepEqual(output.files, ['references/foundations.md']);
});
