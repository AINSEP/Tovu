import assert from 'node:assert/strict';
import test from 'node:test';
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

test('D-13 a single All tab remains navigable', () => {
  const navigate = (tabStrip as any).navigateTabStrip;
  assert.equal(typeof navigate, 'function');
  const f = fixture();
  f.strip.querySelectorAll = () => [f.tabs[0]!];
  navigate({ strip: f.strip, event: { key: 'ArrowLeft', target: f.tabs[0], preventDefault() {} } }, {});
  assert.deepEqual(f.calls, ['focus:All', 'select:All']);
});
