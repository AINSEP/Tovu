import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import { formatDateLabel, formatIsoDate } from "@jini-ai/cms/widgets/date-label";
import { resolveSiteTimeZone } from "../site-timezone.js";

/** Use the real process timezone/Intl boundary, restoring it after each serial test. */
function processZone(t: TestContext, zone: string): void {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

const EVENING_PT = "2026-10-31T03:30:00.000Z";

test("a legacy site's missing creation timezone uses the server's local calendar day", async (t) => {
  processZone(t, "America/Los_Angeles");
  const settingsRepo = new InMemorySettingsRepo();
  for (const creationTimeZone of [undefined, { read: () => undefined }, { read: () => "Invalid/Zone" }]) {
    const timeZone = await resolveSiteTimeZone({ settingsRepo, ...(creationTimeZone ? { creationTimeZone } : {}) }, { workspaceId: "legacy" });
    assert.equal(timeZone, "America/Los_Angeles");
    assert.equal(formatDateLabel({ iso: EVENING_PT }, { timeZone }), "Oct 30, 2026");
    assert.equal(formatIsoDate({ iso: EVENING_PT }, { timeZone }), "2026-10-30");
  }
});

test("the server-local fallback handles Pacific standard time and zones east of UTC", async (t) => {
  processZone(t, "America/Los_Angeles");
  const settingsRepo = new InMemorySettingsRepo();
  const pacific = await resolveSiteTimeZone({ settingsRepo }, { workspaceId: "legacy" });
  assert.equal(formatDateLabel({ iso: "2026-12-01T07:30:00.000Z" }, { timeZone: pacific }), "Nov 30, 2026");
  process.env.TZ = "Asia/Tokyo";
  const tokyo = await resolveSiteTimeZone({ settingsRepo }, { workspaceId: "legacy" });
  assert.equal(tokyo, "Asia/Tokyo");
  assert.equal(formatDateLabel({ iso: "2026-10-30T16:30:00.000Z" }, { timeZone: tokyo }), "Oct 31, 2026");
});

test("an explicit creation timezone including UTC wins over the server's timezone", async (t) => {
  processZone(t, "America/Los_Angeles");
  const settingsRepo = new InMemorySettingsRepo();
  for (const zone of ["UTC", "Asia/Tokyo"]) {
    const timeZone = await resolveSiteTimeZone({ settingsRepo, creationTimeZone: { read: () => zone } }, { workspaceId: "configured" });
    assert.equal(timeZone, zone);
    assert.equal(formatDateLabel({ iso: EVENING_PT }, { timeZone }), "Oct 31, 2026");
  }
});
