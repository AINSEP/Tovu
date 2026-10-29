import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// These consumers must receive a codec rather than construct the native vendor themselves.
for (const relative of ["../image-ops.ts", "../../media/view-image-tool.ts", "../../web-screenshot/screenshot-image.ts", "../../../platform/headless-browser/lazy-browser.ts"]) {
  test(`${relative} keeps native image codecs behind the port`, () => {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:from\s*|import\(\s*|require\(\s*)["']sharp["']/);
  });
}
