import assert from 'node:assert/strict';
import test from 'node:test';

import { findSection, runnerToolNames, sectionsInGroup, visibleSections } from './sections.js';

// Author Checklist: reject removing the hidden filter, making lookup case-insensitive,
// or flattening visible sections only when advertising tools. Expectations are public literals.
// F1.6/F4.1: public section IDs/labels are literals; hidden navigation must not remove tools.
test('visible navigation retains declaration order and filters hidden sections in each group', () => {
  assert.deepEqual(visibleSections().map(({ id, label }) => [id, label]), [
    ['home', 'Home'], ['projects', 'Websites'], ['marketplace', 'Marketplace (not available yet)'],
    ['generation', 'Media'], ['activity', 'Activity'], ['updates', 'Updates'],
  ]);
  assert.deepEqual(sectionsInGroup('workspace').map(({ id }) => id), ['home', 'projects', 'marketplace']);
  assert.deepEqual(sectionsInGroup('work').map(({ id }) => id), ['generation']);
  assert.deepEqual(sectionsInGroup('operations').map(({ id }) => id), ['activity', 'updates']);
  assert.deepEqual(sectionsInGroup('access'), []);
});

test('hidden tasks remain addressable while unknown IDs have no fallback section', () => {
  const tasks = findSection('tasks');
  assert.ok(tasks);
  assert.equal(tasks.hidden, true);
  assert.equal(tasks.label, 'Tasks');
  assert.deepEqual(tasks.tools, ['desktop.queue_task', 'desktop.task.list', 'desktop.task.cancel']);
  assert.equal(findSection('missing'), undefined);
  assert.equal(findSection('toString'), undefined);
  assert.equal(findSection('Projects'), undefined);
  assert.deepEqual(findSection('marketplace')?.tools, []);
});

test('the fleet tool vocabulary includes navigation and the tools of every parked section', () => {
  assert.deepEqual(runnerToolNames(), [
    'desktop.navigate', 'desktop.status', 'desktop.create_site', 'desktop.project.list',
    'desktop.project.start', 'desktop.project.stop', 'desktop.project.restart', 'desktop.project.open', 'desktop.project.delete',
    'desktop.template.list', 'desktop.template.inspect', 'desktop.queue_task', 'desktop.task.list', 'desktop.task.cancel',
    'desktop.generate_video', 'desktop.generate_image', 'desktop.activity.tail', 'desktop.project.logs',
    'desktop.migration.check_drift', 'desktop.migration.upgrade', 'desktop.deploy.publish', 'desktop.deploy.status',
    'desktop.diagnostics.bundle', 'desktop.apikey.issue', 'desktop.apikey.list', 'desktop.apikey.revoke',
    'desktop.settings.get', 'desktop.settings.set', 'desktop.account.get',
  ]);
});
