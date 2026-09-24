import assert from "node:assert/strict";
import test from "node:test";

import { isDaemonLifecycleLogQuiet } from "../daemon-lifecycle-log.js";

/**
 * @file `TOVU_DAEMON_LIFECYCLE_LOG=off` — set by `npm start` (`development/scripts/start.mjs`) and
 * inherited by the agent daemon — is the one switch both the supervisor (first spawn / deliberate
 * exit lines) and the daemon itself (its "listening on" line) read.
 */
test("isDaemonLifecycleLogQuiet: exactly 'off' is quiet", () => {
  assert.equal(isDaemonLifecycleLogQuiet({ TOVU_DAEMON_LIFECYCLE_LOG: "off" }), true);
});

test("isDaemonLifecycleLogQuiet: unset, 'on' or anything else logs as before", () => {
  assert.equal(isDaemonLifecycleLogQuiet({}), false);
  assert.equal(isDaemonLifecycleLogQuiet({ TOVU_DAEMON_LIFECYCLE_LOG: "on" }), false);
  assert.equal(isDaemonLifecycleLogQuiet({ TOVU_DAEMON_LIFECYCLE_LOG: "" }), false);
});
