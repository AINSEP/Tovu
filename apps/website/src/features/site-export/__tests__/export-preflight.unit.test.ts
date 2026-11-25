import assert from "node:assert/strict";
import test from "node:test";
import { privacyPageTemplate } from "@jini-ai/cookie-consent/site/privacy-page-template";
import { createExportPreflight, findContactEmailPlaceholder, findThirdPartyScriptHosts } from "@jini-ai/devops/static-export/site/export-preflight";
import { CONTACT_EMAIL_PLACEHOLDER, EXPORT_PREFLIGHT_COPY } from "../export-preflight-copy.js";

test("the privacy template's own placeholder is what the detector looks for (drift pin)", () => {
  assert.equal(findContactEmailPlaceholder({ placeholder: CONTACT_EMAIL_PLACEHOLDER, html: privacyPageTemplate({ siteTitle: "Site" }) }), true);
  assert.equal(findContactEmailPlaceholder({ placeholder: CONTACT_EMAIL_PLACEHOLDER, html: privacyPageTemplate({ siteTitle: "Site", email: "me@example.com" }) }), false);
});

test("third-party hosts: only other-origin authored scripts count", () => {
  const own = new Set(["example.com"]);
  const html = `<script src="https://CDN.Other.test/a.js"></script><script src="//cdn.proto.test/b.js"></script><script src="/x.js"></script>
    <script src="https://example.com/y.js"></script><script>inline()</script><script data-jini-declared-script src="https://managed.test/c.js"></script>
    <template><script src="https://inert.test/t.js"></script></template><script src="javascript:alert(1)"></script>`;
  assert.deepEqual(findThirdPartyScriptHosts({ html, ownHosts: own }), ["cdn.other.test", "cdn.proto.test"]);
  assert.deepEqual(findThirdPartyScriptHosts({ html: "<p>no scripts</p>", ownHosts: own }), []);
});

test("third-party hosts: mixed-case <ScRiPt> markup still reaches the parser", () => {
  const own = new Set(["site.test"]);
  assert.deepEqual(findThirdPartyScriptHosts({ html: '<p>x</p><ScRiPt src="https://cdn.mixed.test/a.js"></ScRiPt><SCRIPT SRC="https://cdn.upper.test/b.js"></SCRIPT>', ownHosts: own }), ["cdn.mixed.test", "cdn.upper.test"]);
});

test("collector: placeholder always warns; third-party scripts warn only with consent configured; existing warning is kept", () => {
  const html = '<mark>ADD YOUR CONTACT EMAIL</mark><script src="https://t.test/p.js"></script>';
  const off = createExportPreflight({ copy: EXPORT_PREFLIGHT_COPY, ownOrigins: ["https://example.com/base", undefined] });
  off.observePage({ html });
  assert.match(off.joinWarnings({ existing: "Banner missing." }) ?? "", /^Banner missing\. 1 exported page still shows the placeholder/);
  assert.doesNotMatch(off.joinWarnings({ existing: undefined }) ?? "", /third-party/);
  const on = createExportPreflight({ copy: EXPORT_PREFLIGHT_COPY, ownOrigins: [] });
  on.setConsentConfigured({ configured: true });
  on.observePage({ html });
  on.observePage({ html });
  const joined = on.joinWarnings({ existing: undefined }) ?? "";
  assert.match(joined, /2 exported pages still show/);
  assert.match(joined, /2 pages load third-party scripts .*\(t\.test\)/);
  assert.equal(createExportPreflight({ copy: EXPORT_PREFLIGHT_COPY, ownOrigins: [] }).joinWarnings({ existing: undefined }), undefined);
});

test("host preflight copy caps sorted hosts at five and preserves the privacy placeholder warning", () => {
  const preflight = createExportPreflight({ copy: EXPORT_PREFLIGHT_COPY, ownOrigins: [] });
  preflight.setConsentConfigured({ configured: true });
  preflight.observePage({ html: privacyPageTemplate({ siteTitle: "Site" }) +
    ["f.test", "c.test", "e.test", "a.test", "d.test", "b.test"].map(host => `<script src="https://${host}/a.js"></script>`).join("") });
  assert.equal(preflight.joinWarnings({ existing: undefined }),
    '1 exported page still shows the placeholder "ADD YOUR CONTACT EMAIL" (the privacy page\'s contact line). Replace it with a real address before sharing this copy. ' +
    "1 page loads third-party scripts written straight into the page (a.test, b.test, c.test, d.test, e.test, ...). The cookie banner does not hold these back until a visitor agrees. Declare them in the theme's scripts with a consent category, or remove them.");
});
