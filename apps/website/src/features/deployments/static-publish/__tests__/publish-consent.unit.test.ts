import assert from "node:assert/strict";
import { test } from "node:test";
import { checkToolPublishConsent } from "../publish-consent.js";
import type { StaticPublishToolDeps } from "../../publish-tool-deps.js";

/** @file Pins the fail-closed publish refusal when no consent service is bound, so moving its builder cannot change it. */

test("no consent service: publish is refused with the unavailable problem and both review choices", async () => {
  const refusal = await checkToolPublishConsent({ deps: {} as StaticPublishToolDeps, principalId: "owner" });
  assert.deepEqual(refusal, {
    code: "CONSENT_REVIEW_REQUIRED",
    error: "Review cookie consent before publishing this site.",
    blockingProblems: [{ code: "CONSENT_UNAVAILABLE", message: "Cookie consent readiness is unavailable. No publish was started." }],
    choices: [
      { id: "fix-now", label: "Fix now", href: "/consent?tab=overview", action: "Review declarations, the privacy policy and readiness before publishing again." },
      { id: "publish-without-banner", label: "Publish without banner", href: "/consent?tab=rules&intent=publish-without-banner", action: "Explicitly save enabled:false through PUT consent/settings, POST consent/publish with current revision ids, then retry deployment.", warning: "This disables the banner and optional-content enforcement on the live site too. Optional scripts may run without a visitor choice." },
    ],
  });
});
