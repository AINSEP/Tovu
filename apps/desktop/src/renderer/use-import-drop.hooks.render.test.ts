/** Drag and drop on the Import page, from the real hook: the highlight, routing, and a busy page. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { useImportDrop } from './use-import-drop.hooks.js';

const file = (name: string) => ({ name }) as File;
const dropEvent = (files: File[], items: unknown[]) => ({
  preventDefault() {}, stopPropagation() {}, currentTarget: { contains: () => false }, relatedTarget: null,
  dataTransfer: { files, items, dropEffect: '' },
}) as never;
const fileItem = (isDirectory: boolean) => ({ kind: 'file', webkitGetAsEntry: () => ({ isDirectory }) });

function setup(t: { after: (fn: () => void) => void }, busy = false) {
  const seen: string[] = [];
  const hook = renderHook(t, () => useImportDrop(
    { busy, onFolder: (p) => seen.push(`folder:${p}`), onArchive: (p) => seen.push(`archive:${p}`), onRefused: (m) => seen.push(`refused:${m}`) },
    { getPathForFile: (f) => `/x/${f.name}` },
  ));
  return { hook, seen };
}

test('useImportDrop: a folder and a .zip each reach their own handler with the real path', (t) => {
  const { hook, seen } = setup(t);
  act(() => hook.current().dropProps.onDropCapture(dropEvent([file('site')], [fileItem(true)])));
  act(() => hook.current().dropProps.onDropCapture(dropEvent([file('a.tovu.zip')], [fileItem(false)])));
  assert.deepEqual(seen, ['folder:/x/site', 'archive:/x/a.tovu.zip']);
});

test('useImportDrop: a wrong type is refused in words, and dragging over lights the page until the drop', (t) => {
  const { hook, seen } = setup(t);
  act(() => hook.current().dropProps.onDragOver(dropEvent([], [])));
  assert.equal(hook.current().dragging, true);
  act(() => hook.current().dropProps.onDropCapture(dropEvent([file('a.png')], [fileItem(false)])));
  assert.equal(hook.current().dragging, false);
  assert.match(seen[0]!, /^refused:.*website folder or a \.tovu\.zip/);
});

test('useImportDrop: leaving the page clears the light, and a busy page ignores a drop', (t) => {
  const { hook, seen } = setup(t, true);
  act(() => hook.current().dropProps.onDragOver(dropEvent([], [])));
  assert.equal(hook.current().dragging, false, 'a busy page does not invite a drop');
  act(() => hook.current().dropProps.onDropCapture(dropEvent([file('a.zip')], [fileItem(false)])));
  assert.deepEqual(seen, []);
  const free = setup(t);
  act(() => free.hook.current().dropProps.onDragOver(dropEvent([], [])));
  act(() => free.hook.current().dropProps.onDragLeave(dropEvent([], [])));
  assert.equal(free.hook.current().dragging, false);
});

test('useImportDrop: the drop zone\'s own picker routes a .zip by its real path and refuses anything else', (t) => {
  const { hook, seen } = setup(t);
  act(() => hook.current().onPicked([file('a.tovu.zip')]));
  act(() => hook.current().onPicked([file('a.zip'), file('b.zip')]));
  assert.equal(seen[0], 'archive:/x/a.tovu.zip');
  assert.match(seen[1]!, /^refused:.*one website at a time/);
  const busy = setup(t, true);
  act(() => busy.hook.current().onPicked([file('a.zip')]));
  assert.deepEqual(busy.seen, []);
});

test('useImportDrop: the page takes the drop before the drop zone inside it can expand a folder', (t) => {
  const { hook } = setup(t);
  let stopped = false;
  const event = { ...dropEvent([file('site')], [fileItem(true)]) as object, stopPropagation() { stopped = true; } };
  act(() => hook.current().dropProps.onDropCapture(event as never));
  assert.equal(stopped, true);
  assert.equal('onDrop' in hook.current().dropProps, false);
});
