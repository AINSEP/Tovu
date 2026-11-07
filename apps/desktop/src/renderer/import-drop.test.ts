import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyImportDrop } from './import-drop.js';

const file = (name: string) => ({ name }) as File;
const fileItem = (isDirectory: boolean) => ({ kind: 'file', webkitGetAsEntry: () => ({ isDirectory }) });
const drop = (files: File[], items: unknown[]) => ({ files, items }) as unknown as DataTransfer;
const getPathForFile = (f: File) => `/x/${f.name}`;

test('a dropped folder and a dropped .zip each route with their real path', () => {
  assert.deepEqual(classifyImportDrop({ dataTransfer: drop([file('site')], [fileItem(true)]), getPathForFile }), { kind: 'folder', path: '/x/site' });
  assert.deepEqual(classifyImportDrop({ dataTransfer: drop([file('a.TOVU.ZIP')], [fileItem(false)]), getPathForFile }), { kind: 'archive', path: '/x/a.TOVU.ZIP' });
});

test('wrong types, several items and a pathless file get a plain sentence', () => {
  const refused = (d: DataTransfer, paths = getPathForFile) => classifyImportDrop({ dataTransfer: d, getPathForFile: paths });
  assert.match(JSON.stringify(refused(drop([file('a.png')], [fileItem(false)]))), /website folder or a \.tovu\.zip/);
  assert.match(JSON.stringify(refused(drop([], []))), /website folder or a \.tovu\.zip/);
  assert.match(JSON.stringify(refused(drop([file('a.zip'), file('b.zip')], [fileItem(false), fileItem(false)]))), /one website at a time/);
  assert.match(JSON.stringify(refused(drop([file('a.zip')], [fileItem(false)]), () => '')), /Choose file/);
});
