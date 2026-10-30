import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const DEFAULT_RESOURCE_POLICY = "script-src 'self' 'unsafe-inline'; object-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self'; frame-src 'self'; connect-src 'self'";

/** Require exactly one live element; a missing or duplicated consent block is a regression. */
function one({ document, selector }: { document: Document; selector: string }, _options = {}): Element {
  const nodes = document.querySelectorAll(selector);
  assert.equal(nodes.length, 1, selector);
  return nodes[0]!;
}

/** Assert the default first-visit contract introduced by c5e98fea6 before comparing page bytes.
 * contentHtml retains the original source outside the checked consent nodes. stableHtml retains
 * consent too, normalizing only Jini's per-response runtime UUID for exact denial comparisons.
 * No scripts execute. Source offsets avoid reserializing or weakening the page's markup checks. */
export function assertDefaultConsentPage({ html }: { html: string }, _options = {}): { contentHtml: string; stableHtml: string } {
  const dom = new JSDOM(html, { includeNodeLocations: true });
  try {
    const document = dom.window.document;
    const banner = one({ document, selector: "section#jini-consent" });
    assert.deepEqual([...banner.attributes].map(attr => [attr.name, attr.value]), [
      ["id", "jini-consent"], ["class", "jini-consent"], ["data-has-record", "false"],
      ["data-placement", "bottom-right"], ["data-reopen", "link"], ["aria-label", "Cookie preferences"],
    ]);
    assert.equal(banner.querySelector("h2")?.textContent, "Your cookie choices");
    assert.deepEqual([...banner.querySelectorAll(".jini-consent-initial > p")].map(node => node.textContent), [
      "We use necessary cookies to run this site. You can choose whether to allow functional, analytics, and marketing cookies.",
      "Optional cookies and scripts stay paused until you agree.",
    ]);
    assert.equal(banner.querySelector('a[href="/privacy"]')?.textContent, "Privacy policy");
    const form = one({ document, selector: "#jini-consent form" });
    assert.equal(form.getAttribute("method"), "post");
    assert.equal(form.getAttribute("action"), "/api/site-consent");
    assert.deepEqual([...form.querySelectorAll('input[type="hidden"]')].map(node => [node.getAttribute("name"), node.getAttribute("value")]), [
      ["policyVersion", "1"], ["gpc", "0"],
    ]);
    assert.deepEqual([...form.querySelectorAll('input[type="checkbox"]')].map(node => [node.getAttribute("name"), node.hasAttribute("checked"), node.hasAttribute("disabled")]), [
      ["necessary", true, true], ["functional", false, false], ["analytics", false, false], ["marketing", false, false],
    ]);
    assert.deepEqual([...form.querySelectorAll("button")].map(node => [node.getAttribute("name"), node.getAttribute("value"), node.textContent]), [
      ["action", "reject", "Reject non-essential"], ["action", "accept", "Accept all"],
      ["action", "do-not-sell", "Do Not Sell or Share"], ["action", "save", "Save preferences"],
      ["action", "reject", "Reject non-essential"],
    ]);
    const csp = one({ document, selector: 'meta[http-equiv="Content-Security-Policy"]' });
    assert.equal(csp.getAttribute("content"), DEFAULT_RESOURCE_POLICY);
    const config = one({ document, selector: "script#jini-consent-config" });
    const state = JSON.parse(config.textContent!);
    const denied = { necessary: true, functional: false, analytics: false, marketing: false };
    assert.deepEqual({ choices: state.choices, gpcChoices: state.gpcChoices, hasRecord: state.hasRecord, optOut: state.optOut, gpc: state.gpc },
      { choices: denied, gpcChoices: denied, hasRecord: false, optOut: false, gpc: false });
    const style = one({ document, selector: "style[data-jini-consent-style]" });
    assert.ok(style.textContent!.includes("#jini-consent"));
    const runtime = one({ document, selector: "script[data-jini-consent-runtime]" });
    const token = runtime.getAttribute("data-jini-consent-runtime")!;
    assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(runtime.textContent!.includes("window.jiniConsent"));
    const settings = one({ document, selector: "[data-tovu-consent-settings]" });
    assert.equal(settings.querySelector("a[data-jini-consent-open]")?.getAttribute("href"), "#jini-consent");
    assert.equal(settings.textContent, "Cookie settings");

    const ranges = [banner, csp, config, style, runtime, settings].map(node => {
      const location = dom.nodeLocation(node);
      assert.ok(location);
      return location;
    }).sort((a, b) => b.startOffset - a.startOffset);
    let contentHtml = html;
    for (const range of ranges) contentHtml = contentHtml.slice(0, range.startOffset) + contentHtml.slice(range.endOffset);
    return { contentHtml, stableHtml: html.replace(`data-jini-consent-runtime="${token}"`, 'data-jini-consent-runtime="test-runtime"') };
  } finally { dom.window.close(); }
}
