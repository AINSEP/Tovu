/** The extracted panels keep their original DOM and call the existing action owners. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { elements, sourceFunction } from './source-test-harness.js';
import { deleteActionCopy } from './SiteGrid.hooks.js';
import { codeSpans, externalStopConfirm } from './use-site-power.hooks.js';
import { renameInputKeyDown, showsInvalidNameHint } from './use-site-rename.hooks.js';
import { namePasteHandler } from '../contracts/site-name.js';
import type { SiteRecord } from '../contracts/project.js';

const source = readFileSync(new URL('./SiteGrid.tsx', import.meta.url), 'utf8');
const CardOverlays = sourceFunction(source, 'CardOverlays', {
  CardConfirmOverlay: sourceFunction(source, 'CardConfirmOverlay', { codeSpans }),
  CardRenameOverlay: sourceFunction(source, 'CardRenameOverlay', { renameInputKeyDown, showsInvalidNameHint, namePasteHandler }),
  externalStopConfirm,
});
const project = { id: '/sites/a', displayName: 'Bakery', deleteErasesFiles: true,
  externalUrl: 'http://localhost:4321', externalLauncher: 'npm-run-dev' } as SiteRecord;

test('card panels keep one group, propagation guards, busy errors and their original actions', async () => {
  const calls: string[] = [];
  const props = {
    project, copy: deleteActionCopy(project), deleting: false, deleteError: null,
    rename: { draft: 'New bakery', saving: false, canSave: true, renameError: null, setDraft() {},
      cancelRename: () => calls.push('cancel rename'), submitRename: async (id: string) => { calls.push(`rename:${id}`); } },
    power: { cancelStop: () => calls.push('cancel stop'), confirmStop: async (site: SiteRecord) => { calls.push(`stop:${site.id}`); } },
    onCancelDelete: () => calls.push('cancel delete'), onConfirmDelete: async (id: string) => { calls.push(`delete:${id}`); },
  };
  assert.equal(renderToStaticMarkup(CardOverlays({ ...props, overlay: null })), '');
  for (const [overlay, label] of [['rename', 'Save'], ['confirm', props.copy.confirmButtonLabel],
    ['stop', externalStopConfirm({ project })!.confirmButtonLabel]] as const) {
    const tree = CardOverlays({ ...props, overlay });
    const nodes = elements(tree);
    const groups = nodes.filter((node) => node.props.role === 'group');
    assert.equal(groups.length, 1);
    const group = groups[0];
    assert.equal(group.props.className, 'card__confirm');
    assert.ok(renderToStaticMarkup(tree).startsWith('<div class="card__confirm" role="group" aria-label='), 'no extra DOM wrapper');
    let stopped = 0;
    group.props.onClick({ stopPropagation() { stopped++; } });
    group.props.onKeyDown({ stopPropagation() { stopped++; } });
    assert.equal(stopped, 2);
    const buttons = nodes.filter((node) => node.type === 'button');
    buttons.find((node) => node.props.children === 'Cancel')!.props.onClick();
    await buttons.find((node) => node.props.children === label)!.props.onClick();
  }
  assert.deepEqual(calls, ['cancel rename', 'rename:/sites/a', 'cancel delete', 'delete:/sites/a', 'cancel stop', 'stop:/sites/a']);
  const busy = elements(CardOverlays({ ...props, overlay: 'confirm', deleting: true, deleteError: 'Main refused' }));
  assert.equal(busy.find((node) => node.props.role === 'alert')!.props.children, 'Main refused');
  const buttons = busy.filter((node) => node.type === 'button');
  assert.ok(buttons.every((node) => node.props.disabled));
  assert.equal(buttons[1].props.children, props.copy.confirmButtonBusyLabel);
});

test('stop panels preserve the existing fallback copy and optional callback behavior', async () => {
  const copy = deleteActionCopy(project);
  const nodes = elements(CardOverlays({ project: { ...project, externalUrl: undefined }, overlay: 'stop', copy, power: {} }));
  assert.equal(nodes.find((node) => node.props.role === 'group')!.props['aria-label'], copy.confirmTitle);
  const buttons = nodes.filter((node) => node.type === 'button');
  buttons[0].props.onClick();
  await buttons[1].props.onClick();
});
