import assert from "node:assert/strict";
import test from "node:test";
import { privacyPageTemplate } from "../../consent/privacy-page-template.js";
import { createExportPreflight, findContactEmailPlaceholder, findThirdPartyScriptHosts } from "../export-preflight.js";

test("the privacy template's own placeholder is what the detector looks for (drift pin)", () => {
  assert.equal(findContactEmailPlaceholder({ html: privacyPageTemplate({ siteTitle: "Site" }) }), true);
  assert.equal(findContactEmailPlaceholder({ html: privacyPageTemplate({ siteTitle: "Site", email: "me@example.com" }) }), false);
});

test("third-party hosts: only other-origin authored scripts count", () => {
  const own = new Set(["example.com"]);
  const html = `<script src="https://CDN.Other.test/a.js"></script><script src="//cdn.proto.test/b.js"></script><script src="/x.js"></script>
    <script src="https://example.com/y.js"></script><script>inline()</script><script data-jini-declared-script src="https://managed.test/c.js"></script>
    <template><script src="https://inert.test/t.js"></script></template><script src="javascript:alert(1)"></script>`;
  assert.deepEqual(findThirdPartyScriptHosts({ html, ownHosts: own }), ["cdn.other.test", "cdn.proto.test"]);
  assert.deepEqual(findThirdPartyScriptHosts({ html: "<p>no scripts</p>", ownHosts: own }), []);
});

test("collector: placeholder always warns; third-party scripts warn only with consent configured; existing warning is kept", () => {
  const html = '<mark>ADD YOUR CONTACT EMAIL</mark><script src="https://t.test/p.js"></script>';
  const off = createExportPreflight({ ownOrigins: ["https://example.com/base", undefined] });
  off.observePage({ html });
  assert.match(off.joinWarnings({ existing: "Banner missing." }) ?? "", /^Banner missing\. 1 exported page still shows the placeholder/);
  assert.doesNotMatch(off.joinWarnings({ existing: undefined }) ?? "", /third-party/);
  const on = createExportPreflight({ ownOrigins: [] });
  on.setConsentConfigured({ configured: true });
  on.observePage({ html });
  on.observePage({ html });
  const joined = on.joinWarnings({ existing: undefined }) ?? "";
  assert.match(joined, /2 exported pages still show/);
  assert.match(joined, /2 pages load third-party scripts .*\(t\.test\)/);
  assert.equal(createExportPreflight({ ownOrigins: [] }).joinWarnings({ existing: undefined }), undefined);
});
