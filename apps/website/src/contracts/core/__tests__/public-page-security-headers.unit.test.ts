import assert from "node:assert/strict";
import test from "node:test";

import { createPublicPageSecurityHeaderSet } from "../public-page-security-headers.js";

/** L11 Stryker: origin de-duplication and the empty-list `trimEnd` survived; pin the exact CSP. */
const none = { scripts: [], styles: [], fonts: [], fontPreconnects: {} };

test("with no theme resources every directive is exact, with no trailing space", () => {
  assert.deepEqual(createPublicPageSecurityHeaderSet({ resources: none }), {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy-Report-Only": [
      "default-src 'self'", "img-src 'self' data: https:", "media-src 'self' https:",
      "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "font-src 'self' data:",
      "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
      "connect-src 'self'", "object-src 'none'", "base-uri 'self'",
    ].join("; "),
  });
});

test("theme resources contribute their origins once each, never paths", () => {
  const csp = createPublicPageSecurityHeaderSet({ resources: { ...none,
    scripts: ["https://cdn.example/a.js", "https://cdn.example/b.js", "https://js.other/c.js"],
    styles: ["https://fonts.googleapis.com/css?family=A"],
    fonts: ["https://fonts.gstatic.com/a.woff2", "https://fonts.gstatic.com/b.woff2"],
  } })["Content-Security-Policy-Report-Only"]!;
  assert.match(csp, /; script-src 'self' 'unsafe-inline' https:\/\/cdn\.example https:\/\/js\.other; /);
  assert.match(csp, /; style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com; /);
  assert.match(csp, /; font-src 'self' data: https:\/\/fonts\.gstatic\.com; /);
});

test("the header set is frozen", () => {
  const headers = createPublicPageSecurityHeaderSet({ resources: none });
  assert.equal(Object.isFrozen(headers), true);
});
