import { expect, it, vi } from 'vitest';
import type { PageDriver, WebMcpToolRegistration } from '@jini-ai/agentic';
import { registerAdminPageWebMcpTools } from '../admin-page-tools';

it('ordinary field edits, navigation and reviewed install controls run directly; opaque clicks use chat', async () => {
  const tools: WebMcpToolRegistration[] = [];
  const requestPageAction = vi.fn().mockResolvedValue({ executed: false, reason: 'declined' });
  const driver: PageDriver = {
    findElements: async () => [], listPages: async () => [{ id: 'plugins', label: 'Plugins' }], describeField: async () => ({ type: 'text' }),
    highlight: vi.fn(), scrollTo: vi.fn(), click: vi.fn(), fill: vi.fn(), selectOption: vi.fn(), navigate: vi.fn(),
  };
  registerAdminPageWebMcpTools({ driver, signal: new AbortController().signal }, { requestPageAction, isEnabled: () => true,
    modelContext: { registerTool: async ({ tool }) => { tools.push(tool as WebMcpToolRegistration); } } });
  const run = (name: string, args: Record<string, unknown>) => tools.find(tool => tool.name === name)!.execute(args);
  await run('page.fill', { handle: 'plugins-install-folder', text: '/packages/hello' });
  await run('page.navigate', { page: 'plugins' });
  await run('page.click', { handle: 'plugins-install-confirm' });
  expect(driver.fill).toHaveBeenCalledExactlyOnceWith({ handle: 'plugins-install-folder', text: '/packages/hello' });
  expect(driver.click).toHaveBeenCalledExactlyOnceWith({ handle: 'plugins-install-confirm' });
  expect(driver.navigate).toHaveBeenCalledExactlyOnceWith({ page: 'plugins' });
  expect(requestPageAction).not.toHaveBeenCalled();
  expect(await run('page.click', { handle: 'plugin-remove-confirm' })).toEqual({ executed: false, reason: 'declined' });
  expect(requestPageAction).toHaveBeenCalledTimes(1);
  expect(driver.click).toHaveBeenCalledTimes(1);
});
