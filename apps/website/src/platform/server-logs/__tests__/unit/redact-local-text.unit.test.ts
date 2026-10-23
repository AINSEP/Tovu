import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";

import { redactLocalText } from "../../redact-local-text.js";

test("a home outside /Users and /home (root's /root) is masked, which the username policy alone misses", () => {
  const out = redactLocalText({ text: "load failed: /root/private/addon.node and \"/root\"" }, { homeDir: "/root" });
  assert.equal(out, "load failed: ~/private/addon.node and \"~\"");
});

test("a conventional home keeps the shared /home/<USER> and /Users/<USER> masking", () => {
  assert.equal(redactLocalText({ text: "at /home/dev/app.ts" }, { homeDir: "/home/dev" }), "at /home/<USER>/app.ts");
  assert.equal(redactLocalText({ text: "at /Users/dev/app.ts" }, { homeDir: "/Users/dev" }), "at /Users/<USER>/app.ts");
});

test("a sibling path that only shares the home prefix stays readable", () => {
  assert.equal(redactLocalText({ text: "/rootfs/bin and /root.d/x" }, { homeDir: "/root" }), "/rootfs/bin and /root.d/x");
});

test("a filesystem-root home masks no paths, because masking it would erase every absolute path", () => {
  assert.equal(redactLocalText({ text: "/usr/bin/node /etc/hosts" }, { homeDir: "/" }), "/usr/bin/node /etc/hosts");
});

test("credentials are still redacted alongside the home path", () => {
  const secret = ["ghp", "_", "x".repeat(36)].join("");
  const out = redactLocalText({ text: `${secret} /srv/svc/key.pem` }, { homeDir: "/srv/svc/" });
  assert.ok(!out.includes(secret));
  assert.ok(out.endsWith("~/key.pem"));
});

test("without options the current process home is masked", (t) => {
  t.mock.method(os, "homedir", () => "/srv/hermetic-user");
  const out = redactLocalText({ text: "/srv/hermetic-user/private/gate.ts" });
  assert.equal(out, "~/private/gate.ts");
});
