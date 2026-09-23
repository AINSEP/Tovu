/**
 * @file Tests for `contracts/zoom.ts`, the zoom command contract. Its one runtime export is the IPC
 * channel name, and what can go wrong with it is drift: `zoom-menu.ts` (main process) keeps its own
 * inlined copy of the literal rather than importing the contract (see that file's header), so the
 * menu and the preload listener only meet if the two strings agree. This test imports BOTH modules
 * and compares the real values, where `zoom-menu.test.ts`'s older check reads the contract as
 * source text. It lives here, not beside the contract, because `tsconfig.preload.json` compiles
 * every `.ts` file under `src/contracts` into `dist/` — a test there would ship.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ZOOM_COMMAND_CHANNEL } from './contracts/zoom.ts';
import { ZOOM_COMMAND_CHANNEL as MAIN_PROCESS_MIRROR } from './zoom-menu.ts';

test('ZOOM_COMMAND_CHANNEL is the runner-namespaced zoom channel', () => {
  assert.equal(ZOOM_COMMAND_CHANNEL, 'runner:zoom:command');
});

test("the main process's inlined mirror sends on exactly the contract's channel", () => {
  assert.equal(MAIN_PROCESS_MIRROR, ZOOM_COMMAND_CHANNEL);
});
