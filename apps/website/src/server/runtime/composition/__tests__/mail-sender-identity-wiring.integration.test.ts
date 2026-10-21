/**
 * @file The real SQLite composition root (`deps.ts`) wires system mail's From to the site's
 * `core.mail.senderEmail`/`senderName` settings: boot registers both definitions, the composed
 * `mailSenderIdentity` keeps the caller's placeholder while nothing is configured and the mailer is
 * the Console fallback, and a saved sender wins on the very next resolve (read fresh per send).
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getEffective, type AuthorizeFn } from "@jini-ai/core/settings";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { createSettingsPrincipalLookup, MAIL_SENDER_EMAIL_KEY, MAIL_SENDER_NAME_KEY, MAIL_SENDER_NAMESPACE, set } from "#src/features/settings/index";
import { bootSiteDir, closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { initSite } from "#src/platform/site-dir/init-site";

const FALLBACK = { email: "no-reply@members.local", name: "Members" } as const;

test("deps.ts: the composed mailSenderIdentity reads the site's core.mail sender setting, falling back only while unset", async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "mail-sender-wiring-"));
  const dir = path.join(parent, "site");
  await initSite({ dir, name: "Mail Sender Wiring Site" });
  const boot = await bootSiteDir({ dir });
  const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
    db: boot.db,
    workspaceId: boot.workspaceId,
    uploadsDir: path.join(dir, "uploads"),
    themesDir: path.join(dir, "themes"),
    siteBinding: { dir, name: "Mail Sender Wiring Site", dirOverridden: true, switcherCompatible: false },
  });
  t.after(async () => {
    await deps.pluginRuntimeReady;
    await closeSiteDirBoot(boot);
    fs.rmSync(parent, { recursive: true, force: true });
  });
  t.mock.method(console, "warn", () => undefined);
  await deps.siteTitleReady;
  const workspaceId = deps.workspaceId;

  for (const key of [MAIL_SENDER_EMAIL_KEY, MAIL_SENDER_NAME_KEY]) {
    const registered = await getEffective({ repo: deps.settingsRepo }, { namespace: MAIL_SENDER_NAMESPACE, key, scopeContext: { workspaceId } });
    assert.equal(registered?.value, "", `boot registers ${MAIL_SENDER_NAMESPACE}.${key} with an empty default`);
  }

  const resolver = deps.mailSenderIdentity;
  assert.ok(resolver, "the real root always composes a sender-identity resolver");
  assert.deepEqual(await resolver.resolve({ workspaceId, fallback: FALLBACK }), FALLBACK, "unset sender + Console mailer keeps the placeholder");

  const authorize: AuthorizeFn = async () => ({ allowed: true, reason: "test" });
  const settingsDeps = { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize, principals: createSettingsPrincipalLookup({ repo: deps.principalRepo }) };
  const write = (key: string, value: string) =>
    set({ deps: settingsDeps, input: { namespace: MAIL_SENDER_NAMESPACE, key, scope: "workspace", workspaceId, callerPrincipalId: "owner", value } });

  await write(MAIL_SENDER_EMAIL_KEY, "hello@example.com");
  assert.deepEqual(await resolver.resolve({ workspaceId, fallback: FALLBACK }), { email: "hello@example.com", name: "Members" }, "a saved address wins at once; the placeholder name fills the gap");

  await write(MAIL_SENDER_NAME_KEY, "Example Site");
  assert.deepEqual(await resolver.resolve({ workspaceId, fallback: FALLBACK }), { email: "hello@example.com", name: "Example Site" });
});
