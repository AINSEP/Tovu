import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyImportDrop, classifyImportFiles } from './import-drop.js';

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

test('the picker refuses multiple valid archives before resolving any path', () => {
  const selected = [file('sale.tovu.zip'), file('blog.tovu.zip')];
  assert.deepEqual(classifyImportFiles({ files: selected, getPathForFile: () => assert.fail('must not pick either archive') }),
    { kind: 'refused', message: 'Drop one website at a time.' });
});

test('a drag that carries no files list is refused as the wrong type instead of crashing', () => {
  const noFiles = (items: unknown[]) => ({ files: null, items }) as unknown as DataTransfer;
  assert.deepEqual(classifyImportDrop({ dataTransfer: noFiles([]), getPathForFile }), { kind: 'refused', message: "Tovu can't import that. Drop a website folder or a .tovu.zip file." });
});
