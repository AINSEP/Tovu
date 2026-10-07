import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { elements, sourceFunction } from './source-test-harness.js';
import * as tabStrip from './use-tab-strip.hooks.js';

function fixture() {
  const calls: string[] = [];
  const tabs = ['All', 'Alpha', 'Beta'].map((name) => ({
    focus: () => calls.push(`focus:${name}`), click: () => calls.push(`select:${name}`),
  }));
  const strip = { querySelectorAll: (selector: string) => {
    assert.equal(selector, '[role="tab"]');
    return tabs;
  } };
  return { calls, tabs, strip };
}

test('D-13 arrow keys wrap, Home/End select endpoints and focus the selected tab', () => {
  const navigate = (tabStrip as any).navigateTabStrip;
  assert.equal(typeof navigate, 'function');
  for (const [key, from, to] of [['ArrowRight', 0, 1], ['ArrowLeft', 0, 2], ['ArrowRight', 2, 0], ['Home', 2, 0], ['End', 0, 2]] as const) {
    const f = fixture();
    let prevented = false;
    navigate({ strip: f.strip, event: { key, target: f.tabs[from], preventDefault: () => { prevented = true; } } }, {});
    assert.equal(prevented, true);
    assert.deepEqual(f.calls, [`focus:${['All', 'Alpha', 'Beta'][to]}`, `select:${['All', 'Alpha', 'Beta'][to]}`]);
  }
});

test('D-13 ignores other controls, vertical keys, and modified shortcuts', () => {
  const navigate = (tabStrip as any).navigateTabStrip;
  assert.equal(typeof navigate, 'function');
  for (const extra of [{ key: 'ArrowDown' }, { key: 'Tab' }, { key: 'ArrowRight', ctrlKey: true }, { key: 'ArrowRight', metaKey: true }, { key: 'Home', altKey: true }, { key: 'End', shiftKey: true }, { key: 'ArrowLeft', target: {} }]) {
    const f = fixture();
    navigate({ strip: f.strip, event: { target: f.tabs[0], preventDefault: () => assert.fail('must preserve native key'), ...extra } }, {});
    assert.deepEqual(f.calls, []);
  }
});

test('D-13 rendered tabs have one tab stop and wire keyboard navigation', () => {
  const getTabIndex = (tabStrip as any).tabStripTabIndex;
  assert.equal(typeof getTabIndex, 'function');
  const onKeyDown = () => {};
  const TabStrip = sourceFunction(readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), 'TabStrip', {
    useTabStrip: ({ activeTab, projects }: any) => ({
      stripRef: null, overflow: {}, showArrows: false, onKeyDown,
      tabIndex: ({ tabId }: { tabId: string | null }) => getTabIndex({ activeTab, projects, tabId }, {}),
    }),
  });
  const projects = [{ id: 'a', displayName: 'Alpha' }, { id: 'b', displayName: 'Beta' }];
  for (const activeTab of [null, 'a', 'b', 'closed']) {
    const tree = elements(TabStrip({ projects, activeTab }));
    const tabs = tree.filter((e) => e.props.role === 'tab');
    assert.deepEqual(tabs.map((e) => e.props.tabIndex), activeTab === 'a' ? [-1, 0, -1] : activeTab === 'b' ? [-1, -1, 0] : [0, -1, -1]);
    assert.equal(tree.find((e) => e.props.role === 'tablist').props.onKeyDown, onKeyDown);
  }
});

test('D-13 a single All tab remains navigable', () => {
  const navigate = (tabStrip as any).navigateTabStrip;
  assert.equal(typeof navigate, 'function');
  const f = fixture();
  f.strip.querySelectorAll = () => [f.tabs[0]!];
  navigate({ strip: f.strip, event: { key: 'ArrowLeft', target: f.tabs[0], preventDefault() {} } }, {});
  assert.deepEqual(f.calls, ['focus:All', 'select:All']);
});
